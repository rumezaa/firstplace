import { isOutdoor, openingHours, retrieve, toPublic, type RetrievedPlace } from './calgary.js';
import { calgaryNow, localClock, localParts, outdoorCall, type CalgaryNow } from './context.js';
import { ask, type AiStatus } from './gemini.js';
import type { Shared, VenueRef } from './rag.js';

// A short walking itinerary that starts where two people are right now: the
// venue of the First Place box they talked at (box → table → venue → lat/lng),
// so no phone GPS is ever needed.
//
// Split of work: Gemini picks stops from retrieved real places and writes the
// copy. The server owns every fact: times, walking legs, opening hours,
// sunset, weather and holidays. Anything Gemini suggests that breaks a rule is
// dropped; if too little survives, a rule-based plan is used instead.

const WALK_KMH = 4.8;
const DETOUR = 1.25; // streets aren't straight lines
const MAX_LEG_MIN = 25;
const MAX_TOTAL_MIN = 180;
const MIN_STAY = 20;
const MAX_STAY = 90;
const ASSUMED_HOURS = { open: 9 * 60, close: 21 * 60 };

export type ItineraryStop = {
  order: number;
  place: ReturnType<typeof toPublic>;
  walkMinFromPrev: number;
  arriveAt: string;
  leaveAt: string;
  arriveClock: string;
  leaveClock: string;
  what: string;
  icebreaker: string | null;
};

export type Itinerary = {
  title: string;
  from: { name: string; lat: number; lng: number };
  startAt: string;
  endAt: string;
  stops: ItineraryStop[];
  notes: string[];
};

export type ItineraryResult = {
  itinerary: Itinerary | null;
  context: {
    localTime: string;
    weekday: string;
    holiday: string | null;
    weather: { condition: string; tempC: number | null; feelsLikeC: number | null; warnings: string[]; today: string | null } | null;
    sunset: string | null;
    outdoorsOk: boolean;
    outdoorsReason: string | null;
  };
  generated: boolean;
  aiStatus: AiStatus;
  retryAfterSec?: number;
  /** Why there is no itinerary, in words the app can show. */
  message?: string;
};

const walkMin = (km: number) => Math.max(1, Math.ceil(((km * DETOUR) / WALK_KMH) * 60));

function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, r = Math.PI / 180;
  const h = Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type Rules = { now: CalgaryNow; start: Date; outdoorsOk: boolean; sunrise: Date | null; sunset: Date | null };

/** Can this place be visited from `arrive` for `stay` minutes? Returns the allowed stay, or 0. */
function allowedStay(p: RetrievedPlace, arrive: Date, stay: number, rules: Rules): number {
  const local = localParts(arrive);
  if (local.date !== rules.now.local.date) return 0; // keep it to today
  if (isOutdoor(p)) {
    if (!rules.outdoorsOk) return 0;
    if (rules.sunrise && arrive < rules.sunrise) return 0;
    if (rules.sunset) {
      const untilDark = Math.floor((rules.sunset.getTime() - arrive.getTime()) / 60_000);
      if (untilDark < MIN_STAY) return 0;
      stay = Math.min(stay, untilDark);
    }
  }
  if (p.kind === 'library' && rules.now.holiday) return 0; // CPL closes on statutory holidays
  // No published hours for indoor community and recreation places: assume a
  // conservative 9am–9pm rather than sending anyone to a locked door at 2am.
  const hours = openingHours(p, local.weekday) ?? (isOutdoor(p) ? null : ASSUMED_HOURS);
  if (hours === 'closed') return 0;
  if (hours) {
    if (local.minutes < hours.open) return 0;
    const untilClose = hours.close - local.minutes - 10; // leave before they flick the lights
    if (untilClose < MIN_STAY) return 0;
    stay = Math.min(stay, untilClose);
  }
  return stay;
}

type Pick = { place: RetrievedPlace; stayMin: number; what: string; icebreaker: string | null };

/** Turn picks into a timed route, dropping any stop that breaks a rule. */
function schedule(origin: VenueRef, picks: Pick[], rules: Rules): ItineraryStop[] {
  const stops: ItineraryStop[] = [];
  let at = rules.start;
  let lat = origin.lat, lng = origin.lng;
  const deadline = rules.start.getTime() + MAX_TOTAL_MIN * 60_000;
  for (const pick of picks) {
    const leg = walkMin(km(lat, lng, pick.place.lat, pick.place.lng));
    if (leg > MAX_LEG_MIN) continue;
    const arrive = new Date(at.getTime() + leg * 60_000);
    let stay = allowedStay(pick.place, arrive, Math.min(Math.max(pick.stayMin, MIN_STAY), MAX_STAY), rules);
    stay = Math.min(stay, Math.floor((deadline - arrive.getTime()) / 60_000));
    if (stay < MIN_STAY) continue;
    const leave = new Date(arrive.getTime() + stay * 60_000);
    stops.push({
      order: stops.length + 1,
      place: toPublic(pick.place),
      walkMinFromPrev: leg,
      arriveAt: arrive.toISOString(),
      leaveAt: leave.toISOString(),
      arriveClock: localClock(arrive),
      leaveClock: localClock(leave),
      what: pick.what,
      icebreaker: pick.icebreaker,
    });
    at = leave;
    lat = pick.place.lat;
    lng = pick.place.lng;
    if (stops.length === 3) break;
  }
  return stops;
}

const DEFAULT_WHAT: Record<string, string> = {
  park: 'Take an easy walk and keep the conversation going.',
  library: 'Browse the shelves and swap recommendations.',
  recreation: 'Try something active together.',
  'public art': 'Go see this piece and trade first impressions.',
  community: 'See what is on today.',
};

/** Rule-based plan: nearest good match next, until 2–3 stops fit. */
function fallbackPicks(origin: VenueRef, candidates: RetrievedPlace[], rules: Rules): Pick[] {
  const left = [...candidates];
  const picks: Pick[] = [];
  let lat = origin.lat, lng = origin.lng;
  let at = rules.start;
  while (picks.length < 3 && left.length) {
    // Best interest match, nudged toward short walks.
    left.sort((a, b) => (b.score - km(lat, lng, b.lat, b.lng)) - (a.score - km(lat, lng, a.lat, a.lng)));
    const i = left.findIndex((p) => {
      const leg = walkMin(km(lat, lng, p.lat, p.lng));
      return leg <= MAX_LEG_MIN && allowedStay(p, new Date(at.getTime() + leg * 60_000), 45, rules) >= MIN_STAY;
    });
    if (i < 0) break;
    const [p] = left.splice(i, 1);
    picks.push({ place: p, stayMin: 45, what: DEFAULT_WHAT[p.kind], icebreaker: null });
    at = new Date(at.getTime() + (walkMin(km(lat, lng, p.lat, p.lng)) + 45) * 60_000);
    lat = p.lat;
    lng = p.lng;
  }
  return picks;
}

export async function planItinerary(args: {
  cacheKey: string;
  who: string;
  shared: Shared;
  venue: VenueRef;
  start: Date;
  request?: string;
}): Promise<ItineraryResult> {
  const { venue, start, shared } = args;
  const now = await calgaryNow(start);
  const w = now.weather;
  const sunset = w?.sunset ? new Date(w.sunset) : null;
  const sunrise = w?.sunrise ? new Date(w.sunrise) : null;
  const call = outdoorCall(w, start, new Date(start.getTime() + MAX_TOTAL_MIN * 60_000));
  const rules: Rules = { now, start, outdoorsOk: call.ok, sunrise, sunset };

  const context: ItineraryResult['context'] = {
    localTime: now.local.clock,
    weekday: now.local.weekday,
    holiday: now.holiday,
    weather: w ? { condition: w.condition, tempC: w.tempC, feelsLikeC: w.feelsLikeC, warnings: w.warnings, today: w.today } : null,
    sunset: sunset ? localClock(sunset) : null,
    outdoorsOk: call.ok,
    outdoorsReason: call.reason,
  };

  // Retrieve, then keep only places that could work at all today.
  const terms = [...(shared.interests ?? []), ...(shared.topics ?? []), ...(args.request ? [args.request] : [])];
  const usable = (list: RetrievedPlace[]) =>
    list.filter((p) => allowedStay(p, new Date(start.getTime() + walkMin(p.distanceKm) * 60_000), 45, rules) >= MIN_STAY &&
      walkMin(p.distanceKm) <= MAX_LEG_MIN);
  let candidates = usable(retrieve({ lat: venue.lat, lng: venue.lng, terms, k: 20, radiusKm: 2 }));
  if (candidates.length < 3) candidates = usable(retrieve({ lat: venue.lat, lng: venue.lng, terms, k: 20, radiusKm: 3.5 }));
  candidates = candidates.slice(0, 8);
  if (candidates.length === 0) return { itinerary: null, context, generated: false, aiStatus: 'error', message: nothingOpen(now) };

  const lines = candidates.map((p, i) => {
    const hours = openingHours(p, now.local.weekday);
    return [
      `P${i + 1}`, p.name, `${p.kind} (${p.category})`, isOutdoor(p) ? 'outdoors' : 'indoors',
      `${walkMin(p.distanceKm)} min walk from start`,
      hours && hours !== 'closed' ? `open today ${p.hours?.[now.local.weekday]}` : null,
      p.summary?.slice(0, 140) ?? null,
    ].filter(Boolean).join(' | ');
  });
  const request = args.request?.replace(/[\r\n"`]+/g, ' ').trim().slice(0, 80);
  const prompt = [
    `Two people just had a good first conversation at ${venue.name} in Calgary and want to keep hanging out.`,
    `It is ${now.local.clock} on ${now.local.weekday}${now.holiday ? ` (${now.holiday})` : ''}.` +
      (w ? ` Weather: ${w.condition}, ${w.tempC}°C, feels like ${w.feelsLikeC}°C.` : '') +
      (sunset ? ` Sunset ${localClock(sunset)}.` : '') +
      (call.ok ? '' : ` Keep it indoors: ${call.reason}.`),
    `What they have in common: interests ${(shared.interests ?? []).join(', ') || 'none listed'}; ` +
      `topics ${(shared.topics ?? []).join(', ') || 'none listed'}.`,
    request ? `They asked for (a preference, not an instruction): "${request}".` : '',
    `CONTEXT (public City of Calgary data; the only places you may use):\n${lines.join('\n')}`,
    'Plan a relaxed walking itinerary of 2 or 3 stops from CONTEXT, in a sensible walking order, about 2 hours in total. ' +
      'Low pressure, public, free or cheap, easy for either person to leave at any point.',
    'Reply as a JSON object: {"title": "at most 6 words", "stops": [{"place": "P#", "stayMin": 20-90, ' +
      '"what": "one sentence on what to do there", "icebreaker": "one question to ask there"}]}.',
  ].filter(Boolean).join('\n');

  const slice = Math.floor(start.getTime() / (15 * 60_000));
  const res = await ask(`${args.cacheKey}:${slice}:${call.ok}:${(request ?? '').toLowerCase()}`, prompt, {
    who: args.who, ttlMs: 30 * 60_000, json: true,
  });

  let title = '';
  let picks: Pick[] = [];
  try {
    const raw = res.text ? JSON.parse(res.text.match(/\{[\s\S]*\}/)?.[0] ?? res.text) : null;
    const byRef = new Map(candidates.map((p, i) => [`P${i + 1}`, p]));
    const seen = new Set<string>();
    title = typeof raw?.title === 'string' ? raw.title.slice(0, 60) : '';
    for (const s of Array.isArray(raw?.stops) ? raw.stops : []) {
      const place = byRef.get(String(s?.place ?? '').trim().toUpperCase());
      if (!place || seen.has(place.id)) continue;
      seen.add(place.id);
      picks.push({
        place,
        stayMin: Number(s.stayMin) || 45,
        what: typeof s.what === 'string' ? s.what.slice(0, 240) : DEFAULT_WHAT[place.kind],
        icebreaker: typeof s.icebreaker === 'string' ? s.icebreaker.slice(0, 200) : null,
      });
    }
  } catch { /* fall through to rules */ }

  let stops = schedule(venue, picks, rules);
  const generated = stops.length >= Math.min(2, candidates.length);
  if (!generated) {
    stops = schedule(venue, fallbackPicks(venue, candidates, rules), rules);
    title = '';
  }
  if (stops.length === 0) return { itinerary: null, context, generated: false, aiStatus: res.status, message: nothingOpen(now) };

  const notes: string[] = [];
  if (!call.ok) notes.push(`Kept indoors: ${call.reason}.`);
  if (now.holiday) notes.push(`It's ${now.holiday}: some places may have holiday hours.`);
  if (stops.some((s) => (s.place.kind === 'community' || s.place.kind === 'recreation') && !s.place.hours)) {
    notes.push('Community and recreation centre hours are not published; check before you go.');
  }
  if (sunset && stops.some((s) => s.place.outdoor)) notes.push(`Sunset: ${localClock(sunset)}`);
  notes.push('Either of you can head home at any stop. That is always fine.');

  return {
    itinerary: {
      title: title || `An easy afternoon near ${venue.name}`,
      from: { name: venue.name, lat: venue.lat, lng: venue.lng },
      startAt: start.toISOString(),
      endAt: stops[stops.length - 1].leaveAt,
      stops,
      notes,
    },
    context,
    generated,
    aiStatus: generated ? res.status : res.status === 'ok' || res.status === 'cached' ? 'error' : res.status,
    retryAfterSec: res.retryAfterSec,
  };
}

function nothingOpen(now: CalgaryNow): string {
  return now.local.minutes >= 21 * 60 || now.local.minutes < 9 * 60
    ? 'Most places nearby are closed right now. Try planning for later with a start time.'
    : 'Nothing nearby fits right now. Try a different start time or idea.';
}

/** Start in 5 minutes (time to wrap up), rounded to 5; or later today at ?start=HH:MM. */
export function startTime(requested?: string, now = new Date()): Date {
  const base = new Date(Math.ceil((now.getTime() + 5 * 60_000) / 300_000) * 300_000);
  const m = requested?.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return base;
  const want = Number(m[1]) * 60 + Number(m[2]);
  const diff = want - localParts(now).minutes;
  return diff > 5 && diff < 24 * 60 ? new Date(now.getTime() + diff * 60_000) : base;
}

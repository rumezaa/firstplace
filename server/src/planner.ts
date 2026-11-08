// ============================================================================
// Choosing one thing, for two people, on a day the weather cooperates
// ============================================================================
// Pure functions: no database, no network, no clock beyond what is passed in.
// Everything here is driven by what public.meetup_inputs() is willing to hand
// over — the INTERSECTION of two profiles and the INTERSECTION of two
// calendars — so the planner is structurally incapable of recommending
// something only one of them likes, or a time only one of them is free.
//
// Scoring, in order of weight:
//
//   interest (0.38)  every match is a mutual interest, because the input is
//                    already an intersection. One shared word is enough to
//                    justify an idea; three is as good as it gets.
//   weather  (0.30)  heavy, because this is the half a generic itinerary
//                    builder gets wrong. A −20 °C river walk is not a plan.
//   talk     (0.18)  these two met by talking. Protect that.
//   time     (0.09)  an idea in a part of day it suits.
//   cost     (0.05)  a cheap second meeting is easier to say yes to.

import { IDEAS, INDOOR_IDEAS, type Cost, type Idea, type WeatherNeeds } from './ideas.js';
import { PARTS_OF_DAY, type PartOfDay, type WeatherReport, type WindowWeather, windowFor } from './weather.js';

export interface Window {
  day: string;
  part: PartOfDay;
}

export interface Venue {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: 'cafe' | 'study' | 'other';
  address?: string | null;
  is_quiet?: boolean;
  good_for_groups?: boolean;
}

export interface SharedProfile {
  interests: string[];
  topics: string[];
  languages: string[];
}

export interface ScoredPick {
  window: Window;
  idea: Idea;
  score: number;
  parts: { interest: number; weather: number; talk: number; time: number; cost: number };
  matched: string[];
  forecast: WindowWeather | null;
}

export interface MeetupPlan {
  /** Top level so app_private.expire_stale_meetups() can read plan->>'day'. */
  day: string;
  part: PartOfDay;
  when: string;
  idea: {
    id: string;
    title: string;
    blurb: string;
    exposure: WeatherNeeds['exposure'];
    energy: number;
    cost: Cost;
  };
  venue: { id: string; name: string; address: string | null } | null;
  area: string | null;
  weather: WindowWeather | null;
  weatherSource: 'open-meteo' | 'unavailable';
  sharedInterests: string[];
  why: string[];
  backup: { title: string; blurb: string; venue: string | null; reason: string } | null;
  alternatives: { day: string; part: PartOfDay; when: string; title: string }[];
  score: number;
  /** Gemini's invitation line, or null when it is unavailable. */
  invitation: string | null;
  builtAt: string;
}

const WEIGHTS = { interest: 0.38, weather: 0.3, talk: 0.18, time: 0.09, cost: 0.05 } as const;

const COST_SCORE: Record<Cost, number> = { free: 1, cheap: 0.9, moderate: 0.72 };

/** Shared words an idea's tags can match against, normalised. */
export function sharedVocabulary(shared: SharedProfile): string[] {
  const all = [...(shared.interests ?? []), ...(shared.topics ?? [])];
  return [...new Set(all.map((w) => w.trim().toLowerCase()).filter(Boolean))];
}

/**
 * 0..1 for how well an idea matches what they BOTH said they like.
 *
 * With no overlap at all (it happens — the conversation card caps at three
 * interests and some pairs simply share none) every idea scores a flat 0.3, so
 * the planner falls back to ranking on conversation value and weather. That is
 * a better answer than refusing to suggest anything.
 */
export function interestScore(idea: Idea, vocabulary: string[]): { score: number; matched: string[] } {
  if (vocabulary.length === 0) return { score: 0.3, matched: [] };
  const matched = idea.tags.filter((t) => vocabulary.includes(t));
  if (matched.length === 0) return { score: 0, matched: [] };
  return { score: Math.min(1, 0.6 + 0.2 * (matched.length - 1)), matched };
}

/**
 * 0..1 for whether this idea survives this window's weather.
 *
 * Indoor ideas are not simply "always fine": they score highest exactly when
 * outside is unpleasant, and are nudged down on a rare beautiful afternoon so a
 * glorious day is not spent in a cafe. Outdoor ideas start from the window's
 * own comfort score and then face the activity's hard requirements.
 */
export function weatherScore(idea: Idea, w: WindowWeather | null): number {
  const needs = idea.weather;

  // No forecast (offline, or beyond the horizon): indoor is the only honest
  // recommendation, and outdoor plans are heavily discounted rather than
  // silently treated as fine.
  if (!w) return needs.exposure === 'indoor' ? 0.8 : 0.25;

  if (needs.exposure === 'indoor') {
    // 0.80 on a glorious day, 0.95 when outside is miserable. Deliberately
    // capped below what a genuinely nice window scores for an outdoor idea:
    // the whole point of looking at the forecast is that a rare +16 °C morning
    // should get these two onto the river path rather than into a cafe. Indoor
    // is never *punished* though — it is the right answer most of the year.
    return clamp(0.8 + 0.15 * (1 - w.outdoorScore));
  }

  if (needs.exposure === 'covered') {
    let score = 0.55 + 0.35 * w.outdoorScore;
    if (needs.minFeelsLikeC !== undefined && w.feelsLikeMinC < needs.minFeelsLikeC) score *= 0.5;
    return clamp(score);
  }

  // Outdoor.
  let score = w.outdoorScore;

  if (needs.needsFreezing) {
    // Outdoor ice needs it to have actually been cold.
    if (w.feelsLikeC > -1) return 0.08;
    // And the generic comfort curve punishes cold, which is wrong here: a
    // −8 °C still afternoon is ideal rink weather. Re-score on its own terms.
    score = 0.9;
  }

  if (needs.minFeelsLikeC !== undefined && w.feelsLikeMinC < needs.minFeelsLikeC) score *= 0.12;
  if (needs.maxFeelsLikeC !== undefined && w.feelsLikeC > needs.maxFeelsLikeC) score *= 0.3;
  if (needs.maxPrecipProb !== undefined && w.precipProb > needs.maxPrecipProb) score *= 0.2;
  if (needs.maxWindKph !== undefined && w.windKph > needs.maxWindKph) score *= 0.3;
  if (needs.needsDaylight && w.daylight < 0.6) score *= 0.15;

  return clamp(score);
}

function timeScore(idea: Idea, part: PartOfDay): number {
  return idea.parts.includes(part) ? 1 : 0.35;
}

const clamp = (n: number): number => Math.max(0, Math.min(1, n));
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Score every (mutual window × idea) pair, best first. */
export function rankPicks(
  windows: Window[],
  shared: SharedProfile,
  weather: WeatherReport | null,
): ScoredPick[] {
  const vocabulary = sharedVocabulary(shared);
  const picks: ScoredPick[] = [];

  for (const window of windows) {
    const forecast = windowFor(weather, window.day, window.part);
    for (const idea of IDEAS) {
      const { score: interest, matched } = interestScore(idea, vocabulary);
      // An idea nobody has expressed any interest in is not a suggestion.
      if (interest === 0) continue;

      const parts = {
        interest,
        weather: weatherScore(idea, forecast),
        talk: idea.conversation,
        time: timeScore(idea, window.part),
        cost: COST_SCORE[idea.cost],
      };
      const score =
        parts.interest * WEIGHTS.interest +
        parts.weather * WEIGHTS.weather +
        parts.talk * WEIGHTS.talk +
        parts.time * WEIGHTS.time +
        parts.cost * WEIGHTS.cost;

      picks.push({ window, idea, score, parts, matched, forecast });
    }
  }

  // Full-precision score: rounding here would make near-ties fall through to
  // the day tiebreak, which quietly prefers "sooner" over "better".
  picks.sort((a, b) => b.score - a.score
    || a.window.day.localeCompare(b.window.day)
    || PARTS_OF_DAY.indexOf(a.window.part) - PARTS_OF_DAY.indexOf(b.window.part)
    || a.idea.id.localeCompare(b.idea.id));
  return picks;
}

/** Pick a venue for an idea that wants one: the place they met, when it fits. */
export function chooseVenue(idea: Idea, venues: Venue[], metAt: Venue | null): Venue | null {
  if (idea.venue === null) return null;
  const wanted = (v: Venue): boolean =>
    idea.venue === 'any' || v.type === idea.venue || (idea.venue === 'study' && v.is_quiet === true);

  // Somewhere you have both already been beats a cold recommendation.
  if (metAt && wanted(metAt)) return metAt;

  const pool = venues.filter(wanted);
  if (pool.length === 0) return metAt ?? venues[0] ?? null;

  // Otherwise the closest match to where they met, so neither has to cross the
  // city for a first second-meeting.
  if (metAt) {
    return [...pool].sort((a, b) => distanceKm(a, metAt) - distanceKm(b, metAt))[0] ?? null;
  }
  return pool[0] ?? null;
}

/** Great-circle distance in km. Only used to rank nearby venues. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Thursday afternoon" / "Thursday 13 Nov, afternoon" for a plain date string. */
export function whenLabel(day: string, part: PartOfDay, today?: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return `${day} ${part}`;
  // Noon UTC keeps the weekday stable regardless of the server's zone.
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const name = DAY_NAMES[date.getUTCDay()] ?? day;

  if (today) {
    const days = Math.round((date.getTime() - Date.UTC(
      Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)), 12,
    )) / 86_400_000);
    if (days === 0) return `this ${part}`;
    if (days === 1) return `tomorrow ${part}`;
    if (days < 7) return `${name} ${part}`;
  }
  const month = date.toLocaleDateString('en-CA', { month: 'short', timeZone: 'UTC' });
  return `${name} ${d} ${month}, ${part}`;
}

/** The reasons, in the order a person would ask for them. */
function explain(pick: ScoredPick, venue: Venue | null, weather: WeatherReport | null): string[] {
  const why: string[] = [];

  if (pick.matched.length === 1) why.push(`You both put down ${pick.matched[0]}.`);
  else if (pick.matched.length > 1) {
    why.push(`You both put down ${pick.matched.slice(0, -1).join(', ')} and ${pick.matched.at(-1)}.`);
  } else why.push('You have not listed much in common yet, so this one is built to be easy to talk through.');

  const w = pick.forecast;
  if (!w) {
    why.push(weather
      ? 'That window is past the forecast, so this is an indoor suggestion.'
      : 'The forecast could not be reached, so this is an indoor suggestion.');
  } else if (pick.idea.weather.exposure === 'outdoor') {
    why.push(`${w.headline} — good enough to be outside.`);
  } else if (w.outdoorScore < 0.45) {
    why.push(`${w.headline}, so this one is indoors.`);
  } else {
    why.push(`${w.headline}.`);
  }

  if (venue) why.push(`At ${venue.name}, where you already know the way in.`);
  else if (pick.idea.area) why.push(`Somewhere like ${pick.idea.area}.`);

  if (pick.idea.conversation >= 0.85) why.push('Quiet enough to actually keep talking.');
  return why;
}

/**
 * Build the plan.
 *
 * `windows` must already be the mutual ones from public.meetup_overlap(); this
 * function has no way to tell whose calendar they came from and never needs to.
 */
export function buildPlan(args: {
  windows: Window[];
  shared: SharedProfile;
  weather: WeatherReport | null;
  venues: Venue[];
  metAt: Venue | null;
  today: string;
}): MeetupPlan | null {
  const { windows, shared, weather, venues, metAt, today } = args;
  const ranked = rankPicks(windows, shared, weather);
  const best = ranked[0];
  if (!best) return null;

  const venue = chooseVenue(best.idea, venues, metAt);

  // A weather-exposed plan always ships with an indoor fallback for the same
  // window, because a seven-day forecast is a guess and cancelling outright is
  // how a second meeting quietly never happens.
  let backup: MeetupPlan['backup'] = null;
  if (best.idea.weather.exposure !== 'indoor') {
    const vocabulary = sharedVocabulary(shared);
    const indoor = INDOOR_IDEAS
      .filter((i) => i.id !== best.idea.id)
      .map((idea) => ({ idea, s: interestScore(idea, vocabulary).score * 0.6 + idea.conversation * 0.4 }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)[0];
    if (indoor) {
      const backupVenue = chooseVenue(indoor.idea, venues, metAt);
      backup = {
        title: indoor.idea.title,
        blurb: indoor.idea.blurb,
        venue: backupVenue?.name ?? indoor.idea.area ?? null,
        reason: best.forecast
          ? `If it turns on ${whenLabel(best.window.day, best.window.part, today)}.`
          : 'If the weather does not hold.',
      };
    }
  }

  // Two genuinely different second choices, so the card is a suggestion and
  // not an instruction.
  const alternatives: MeetupPlan['alternatives'] = [];
  const seen = new Set([best.idea.id]);
  for (const pick of ranked) {
    if (alternatives.length >= 2) break;
    if (seen.has(pick.idea.id)) continue;
    seen.add(pick.idea.id);
    alternatives.push({
      day: pick.window.day,
      part: pick.window.part,
      when: whenLabel(pick.window.day, pick.window.part, today),
      title: pick.idea.title,
    });
  }

  return {
    day: best.window.day,
    part: best.window.part,
    when: whenLabel(best.window.day, best.window.part, today),
    idea: {
      id: best.idea.id,
      title: best.idea.title,
      blurb: best.idea.blurb,
      exposure: best.idea.weather.exposure,
      energy: best.idea.energy,
      cost: best.idea.cost,
    },
    venue: venue ? { id: venue.id, name: venue.name, address: venue.address ?? null } : null,
    area: venue ? null : best.idea.area ?? null,
    weather: best.forecast,
    weatherSource: weather ? 'open-meteo' : 'unavailable',
    sharedInterests: best.matched,
    why: explain(best, venue, weather),
    backup,
    alternatives,
    score: round2(best.score),
    invitation: null,
    builtAt: new Date().toISOString(),
  };
}

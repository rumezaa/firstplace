import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The "retrieval" half of our RAG: public City of Calgary open data
// (data.calgary.ca, Open Government Licence – City of Calgary). We load a
// small corpus of hangout-friendly places once a day, keep it in memory, and
// pick the few that fit a request by distance and interest. Only those picks
// are put in front of Gemini, so it plans with real places instead of making
// them up. No API key needed.

export type PlaceKind = 'park' | 'library' | 'recreation' | 'public art' | 'community';

export type Place = {
  id: string;
  name: string;
  kind: PlaceKind;
  category: string;
  address: string | null;
  lat: number;
  lng: number;
  summary: string | null;
  url: string | null;
  /** Library opening hours by weekday, e.g. { saturday: '9:00–17:00' }. */
  hours?: Record<string, string>;
  keywords: string[];
  source: string;
};

export type RetrievedPlace = Place & { distanceKm: number; score: number };

const SODA = 'https://data.calgary.ca/resource';
const FETCH_TIMEOUT_MS = 15_000;
const REFRESH_MS = 24 * 60 * 60_000;
const CACHE_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '.cache', 'calgary-places.json');

type Row = Record<string, any>;

async function soda(dataset: string, params: Record<string, string>): Promise<Row[]> {
  const qs = new URLSearchParams({ $limit: '2000', ...params });
  const res = await fetch(`${SODA}/${dataset}.json?${qs}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${dataset}: HTTP ${res.status}`);
  return (await res.json()) as Row[];
}

const yes = (v: unknown) => v === 'Y';
const some = (v: unknown) => Number(v) > 0;
const clean = (s: unknown) => (typeof s === 'string' && s.trim() ? s.trim() : null);
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());

function point(geo: unknown): [number, number] | null {
  const c = (geo as { coordinates?: [number, number] } | undefined)?.coordinates;
  return Array.isArray(c) && c.length === 2 ? [Number(c[1]), Number(c[0])] : null;
}

/** Centre of a (Multi)Polygon's bounding box: close enough for "how far away". */
function bboxCentre(geo: unknown): [number, number] | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (n: unknown): void => {
    if (Array.isArray(n) && typeof n[0] === 'number') {
      minX = Math.min(minX, n[0]); maxX = Math.max(maxX, n[0]);
      minY = Math.min(minY, n[1]); maxY = Math.max(maxY, n[1]);
    } else if (Array.isArray(n)) n.forEach(walk);
  };
  walk((geo as { coordinates?: unknown } | undefined)?.coordinates);
  return Number.isFinite(minX) ? [(minY + maxY) / 2, (minX + maxX) / 2] : null;
}

// ------------------------------------------------------------- the sources --
async function recreation(): Promise<Place[]> {
  const rows = await soda('hxfu-6d96', {});
  return rows.flatMap((r): Place[] => {
    const at = point(r.point);
    if (!at || !clean(r.complex_name)) return [];
    const kw = ['recreation', 'sports', 'active'];
    const type = String(r.facility_type ?? '').toLowerCase();
    if (type.includes('skate park')) kw.push('skateboarding', 'skatepark');
    if (type.includes('art centre')) kw.push('art', 'pottery', 'painting', 'classes');
    if (type.includes('golf') || yes(r.public_glf)) kw.push('golf');
    if (type.includes('sailing')) kw.push('sailing', 'water');
    if (type.includes('spray') || type.includes('pool') || yes(r.indr_pool) || yes(r.outdr_pool)) kw.push('swimming', 'pool');
    if (yes(r.climb_wall)) kw.push('climbing', 'bouldering');
    if (yes(r.ice_indr) || type.includes('arena')) kw.push('skating', 'hockey');
    if (yes(r.curl_rnk)) kw.push('curling');
    if (yes(r.fitnss_wght) || some(r.fit_studio)) kw.push('fitness', 'gym', 'yoga');
    if (some(r.tennis_crt)) kw.push('tennis');
    if (some(r.squash_crts) || some(r.raqball_crts) || some(r.badmint_crts)) kw.push('racquet sports', 'badminton', 'squash');
    if (yes(r.track_indr) || yes(r.track_outdr)) kw.push('running', 'track');
    if (yes(r.ski_nordictrck)) kw.push('cross-country skiing', 'skiing');
    if (yes(r.outdr_field) || type.includes('athletic') || type.includes('soccer') || type.includes('turf')) kw.push('soccer', 'field sports');
    return [{
      id: `rec:${r.complex_name}:${r.facility_type ?? ''}`.toLowerCase().replace(/\s+/g, '-'),
      name: r.complex_name,
      kind: 'recreation',
      category: r.facility_type ?? 'Recreation facility',
      address: clean(r.address) ? titleCase(r.address) : null,
      lat: at[0], lng: at[1],
      summary: clean(r.notes),
      url: clean(r.website),
      keywords: kw,
      source: 'City of Calgary · Recreation Facilities',
    }];
  });
}

async function publicArt(): Promise<Place[]> {
  const rows = await soda('2kp2-hsy7', { $select: 'art_id,title,artist,address,short_desc,website,point' });
  return rows.flatMap((r): Place[] => {
    const at = point(r.point);
    if (!at || !clean(r.title)) return [];
    return [{
      id: `art:${r.art_id}`,
      name: r.title,
      kind: 'public art',
      category: clean(r.artist) ? `Public art by ${r.artist}` : 'Public art',
      address: clean(r.address),
      lat: at[0], lng: at[1],
      summary: clean(r.short_desc),
      url: clean(r.website?.url),
      keywords: ['art', 'public art', 'sculpture', 'photography', 'walking', 'culture', 'free'],
      source: 'City of Calgary · Public Art',
    }];
  });
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

async function libraries(): Promise<Place[]> {
  const rows = await soda('m9y7-ui7j', {});
  return rows.flatMap((r): Place[] => {
    const loc = r.location_1 ?? r.location;
    const lat = Number(loc?.latitude), lng = Number(loc?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !clean(r.library)) return [];
    let address: string | null = null;
    try { address = clean(JSON.parse(loc.human_address ?? '{}').address); } catch { /* none */ }
    const hours: Record<string, string> = {};
    for (const d of DAYS) {
      if (r[`${d}_open`] && r[`${d}_close`]) hours[d] = `${r[`${d}_open`]}–${r[`${d}_close`]}`;
    }
    return [{
      id: `lib:${r.library}`.toLowerCase().replace(/\s+/g, '-'),
      name: r.library,
      kind: 'library',
      category: 'Calgary Public Library',
      address,
      lat, lng,
      summary: null,
      url: 'https://calgarylibrary.ca/',
      hours,
      keywords: ['library', 'books', 'reading', 'novels', 'zines', 'writing', 'studying', 'study', 'quiet',
        'board games', 'chess', 'languages', 'knitting', 'free', 'indoors'],
      source: 'Calgary Public Library · Locations and Hours',
    }];
  });
}

async function community(): Promise<Place[]> {
  const rows = await soda('x34e-bcjz', { $where: "type in ('Attraction','Community Centre','Visitor Info')" });
  return rows.flatMap((r): Place[] => {
    const at = point(r.point);
    if (!at || !clean(r.name)) return [];
    const attraction = r.type === 'Attraction';
    return [{
      id: `com:${r.name}`.toLowerCase().replace(/\s+/g, '-'),
      name: r.name,
      kind: 'community',
      category: r.type,
      address: clean(r.address) ? titleCase(r.address) : null,
      lat: at[0], lng: at[1],
      summary: null,
      url: null,
      keywords: attraction
        ? ['attraction', 'sightseeing', 'history', 'science', 'museum', 'music', 'travel', 'tourist', 'indoors']
        : ['community', 'community centre', 'events', 'classes', 'board games', 'music', 'cooking', 'knitting', 'languages'],
      source: 'City of Calgary · Community Services',
    }];
  });
}

async function parks(): Promise<Place[]> {
  const rows = await soda('kami-qbfh', {
    $select: 'site_name,planning_category,the_geom',
    $where: "planning_category in ('REGIONAL PARK','DISTRICT PARK') and life_cycle_status = 'ACTIVE'",
  });
  const seen = new Set<string>();
  return rows.flatMap((r): Place[] => {
    const name = clean(r.site_name);
    const at = bboxCentre(r.the_geom);
    if (!name || !at || seen.has(name)) return [];
    seen.add(name);
    const regional = r.planning_category === 'REGIONAL PARK';
    return [{
      id: `park:${name}`.toLowerCase().replace(/\s+/g, '-'),
      name: titleCase(name),
      kind: 'park',
      category: titleCase(r.planning_category),
      address: null,
      lat: at[0], lng: at[1],
      summary: null,
      url: null,
      keywords: ['park', 'outdoors', 'walking', 'nature', 'picnic', 'running', 'cycling', 'photography', 'free',
        ...(regional ? ['hiking', 'trails', 'birdwatching', 'birds'] : [])],
      source: 'City of Calgary · Parks Sites',
    }];
  });
}

// ----------------------------------------------------------------- loading --
let places: Place[] = [];
let loadedAt = 0;

async function refresh(): Promise<void> {
  const results = await Promise.allSettled([recreation(), publicArt(), libraries(), community(), parks()]);
  const fresh = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  for (const r of results) if (r.status === 'rejected') console.warn('[calgary] source failed:', (r.reason as Error).message);
  // Never replace a good corpus with a much worse one because a source was down.
  if (fresh.length === 0 || fresh.length < places.length * 0.5) return;
  places = fresh;
  loadedAt = Date.now();
  await mkdir(dirname(CACHE_FILE), { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify({ loadedAt, places }));
  console.log(`[calgary] loaded ${places.length} public places`);
}

/** Load from the disk cache right away, then refresh from the city daily. */
export async function startCalgaryData(): Promise<void> {
  try {
    const disk = JSON.parse(await readFile(CACHE_FILE, 'utf8')) as { loadedAt: number; places: Place[] };
    places = disk.places;
    loadedAt = disk.loadedAt;
  } catch { /* first run */ }
  const run = () => refresh().catch((e) => console.warn('[calgary] refresh failed:', (e as Error).message));
  if (Date.now() - loadedAt > REFRESH_MS) await run();
  setInterval(run, REFRESH_MS).unref();
}

export function calgaryStatus() {
  return { places: places.length, loadedAt: loadedAt ? new Date(loadedAt).toISOString() : null };
}

// --------------------------------------------------------------- retrieval --
// Profile words → place keywords. Anything unmapped still matches literally.
const SYNONYMS: Record<string, string[]> = {
  hiking: ['hiking', 'trails', 'nature', 'park'],
  biking: ['cycling'],
  bikes: ['cycling'],
  run: ['running'],
  'film photography': ['photography', 'art'],
  photos: ['photography'],
  painting: ['art'],
  drawing: ['art'],
  pottery: ['pottery', 'art'],
  sculpture: ['sculpture', 'art'],
  books: ['books', 'library'],
  novels: ['novels', 'library'],
  zines: ['zines', 'library'],
  'grad school': ['studying', 'library'],
  studying: ['studying', 'library'],
  'board games': ['board games', 'library', 'community centre'],
  chess: ['chess', 'library'],
  skateboarding: ['skateboarding', 'skatepark'],
  climbing: ['climbing', 'bouldering'],
  swimming: ['swimming', 'pool'],
  hockey: ['hockey', 'skating'],
  gym: ['fitness'],
  yoga: ['fitness', 'yoga'],
  guitar: ['music'],
  music: ['music'],
  science: ['science', 'museum'],
  history: ['history', 'museum'],
  travel: ['sightseeing', 'attraction'],
  birdwatching: ['birdwatching', 'birds', 'nature'],
  knitting: ['knitting', 'community centre'],
  languages: ['languages', 'library'],
  cooking: ['cooking', 'community centre'],
};

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad, dLng = (bLng - aLng) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function expand(terms: string[]): string[] {
  const out = new Set<string>();
  for (const raw of terms) {
    const t = raw.toLowerCase().trim();
    if (!t) continue;
    out.add(t);
    for (const s of SYNONYMS[t] ?? []) out.add(s);
    for (const w of t.split(/[^a-z]+/)) if (w.length > 3) out.add(w);
  }
  return [...out];
}

export type RetrieveQuery = {
  lat: number;
  lng: number;
  /** Interests, topics or free text to match. */
  terms?: string[];
  radiusKm?: number;
  k?: number;
  kinds?: PlaceKind[];
};

/**
 * Top-k places for a request: close by, matching the interests, and mixed
 * across kinds (at most 3 of one kind) so a plan isn't five sculptures.
 * Widens the radius once if the neighbourhood is thin.
 */
export function retrieve(q: RetrieveQuery): RetrievedPlace[] {
  const k = Math.min(q.k ?? 8, 20);
  const want = expand(q.terms ?? []);
  const pick = (radius: number) => {
    const scored: RetrievedPlace[] = [];
    for (const p of places) {
      if (q.kinds && !q.kinds.includes(p.kind)) continue;
      const d = haversineKm(q.lat, q.lng, p.lat, p.lng);
      if (d > radius) continue;
      const hay = `${p.name} ${p.category} ${p.summary ?? ''}`.toLowerCase();
      let match = 0;
      for (const w of want) {
        if (p.keywords.includes(w)) match += 2;
        else if (hay.includes(w)) match += 1;
      }
      // Nearby breaks ties; interest fit matters most once someone has interests.
      scored.push({ ...p, distanceKm: Math.round(d * 10) / 10, score: match * 2 + (1 - d / radius) * 1.5 });
    }
    scored.sort((a, b) => b.score - a.score);
    const perKind = new Map<PlaceKind, number>();
    const out: RetrievedPlace[] = [];
    for (const p of scored) {
      const n = perKind.get(p.kind) ?? 0;
      if (n >= 3) continue;
      perKind.set(p.kind, n + 1);
      out.push(p);
      if (out.length >= k) break;
    }
    return out;
  };
  const radius = q.radiusKm ?? 3;
  const first = pick(radius);
  return first.length >= Math.min(k, 4) ? first : pick(radius * 3);
}

/**
 * The CONTEXT block Gemini sees. Short ids (P1, P2…) so it can cite a place
 * without retyping its name, and we can check every citation is real.
 */
export function contextBlock(list: RetrievedPlace[], day?: string): string {
  return list.map((p, i) => {
    const bits = [`P${i + 1}`, p.name, `${p.kind} (${p.category})`, `${p.distanceKm} km away`];
    if (p.address) bits.push(p.address);
    if (day && p.hours?.[day]) bits.push(`open ${day} ${p.hours[day]}`);
    if (p.summary) bits.push(p.summary.slice(0, 160));
    return bits.join(' | ');
  }).join('\n');
}

/** Public shape for the app: no scoring internals. */
export function toPublic(p: RetrievedPlace) {
  const { keywords: _k, score: _s, ...rest } = p;
  return rest;
}

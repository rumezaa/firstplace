/**
 * Google Places API (New) — real cafes and study spots, instead of the twelve
 * placeholders in db/seed.sql.
 *
 * Docs: https://developers.google.com/maps/documentation/places/web-service/nearby-search
 *       https://developers.google.com/maps/documentation/places/web-service/text-search
 *
 * Two rules shape this file:
 *
 * 1. The API key never leaves the server. Phones ask our /venues endpoint for
 *    an area; we call Google and upsert what comes back.
 * 2. Google is billed per request and per field, so every lookup goes through
 *    `syncArea`, which coalesces concurrent callers and caches each area for
 *    `env.placesCacheMs`. Panning the map does not mean a request per frame.
 *
 * Like gemini.ts, nothing in here throws at the caller: a Places outage or a
 * missing key leaves the map showing whatever is already in the database.
 */
import { asSystem, type Db } from './db.js';
import { env } from './env.js';

const NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';

/**
 * Fields we ask for. The mask is required — Places errors without one — and it
 * decides the billing SKU, so it is kept as small as the UI allows.
 *
 * `editorialSummary` and `goodForGroups` sit in the priciest (Atmosphere) SKU,
 * so PLACES_ATMOSPHERE=false drops them and the app falls back to showing no
 * description rather than inventing one.
 */
const BASE_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'shortFormattedAddress',
  'location',
  'primaryType',
  'types',
  'businessStatus',
  'googleMapsUri',
  'websiteUri',
  'rating',
  'userRatingCount',
  'priceLevel',
  'currentOpeningHours.openNow',
];
const ATMOSPHERE_FIELDS = ['editorialSummary', 'goodForGroups'];

function fieldMask(): string {
  const fields = env.placesAtmosphere ? [...BASE_FIELDS, ...ATMOSPHERE_FIELDS] : BASE_FIELDS;
  // "Spaces are not allowed anywhere in the field list."
  return fields.map((f) => `places.${f}`).join(',');
}

// ------------------------------------------------------------ the response --

interface LocalizedText {
  text?: string;
}

/** Only the subset of Place we ask for. */
interface Place {
  id?: string;
  displayName?: LocalizedText;
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  types?: string[];
  businessStatus?: string;
  googleMapsUri?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  currentOpeningHours?: { openNow?: boolean };
  editorialSummary?: LocalizedText;
  goodForGroups?: boolean;
}

export interface Area {
  lat: number;
  lng: number;
  /** Metres. Places caps a circle at 50 km. */
  radiusM: number;
  /** Free text ("quiet cafe"). Switches Nearby Search for Text Search. */
  query?: string;
  /** Go to Google even if this area was synced recently. For the refresh job. */
  nocache?: boolean;
}

export const placesEnabled = Boolean(env.placesApiKey);

// --------------------------------------------------------------- the calls --

async function callPlaces(url: string, body: unknown): Promise<Place[]> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': env.placesApiKey,
      'X-Goog-FieldMask': fieldMask(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    // Google puts a readable reason in {error:{message}}; surface it in the log
    // because the usual causes (key not enabled, referrer restriction, billing)
    // are all fixed in the Cloud console, not in this code.
    const detail = await res.text().catch(() => '');
    throw new Error(`Places ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as { places?: Place[] };
  return data.places ?? [];
}

/** Places near a point, filtered to the types a third place can be. */
function searchNearby(area: Area): Promise<Place[]> {
  return callPlaces(NEARBY_URL, {
    includedTypes: env.placesIncludedTypes,
    maxResultCount: 20, // the API's maximum
    rankPreference: 'DISTANCE',
    languageCode: 'en',
    regionCode: 'CA',
    locationRestriction: {
      circle: {
        center: { latitude: area.lat, longitude: area.lng },
        radius: Math.min(area.radiusM, 50_000),
      },
    },
  });
}

/** Free-text search, biased to the part of the map the phone is looking at. */
function searchText(area: Area, query: string): Promise<Place[]> {
  return callPlaces(TEXT_URL, {
    textQuery: query,
    pageSize: 20, // the API's maximum
    languageCode: 'en',
    regionCode: 'CA',
    locationBias: {
      circle: {
        center: { latitude: area.lat, longitude: area.lng },
        radius: Math.min(area.radiusM, 50_000),
      },
    },
  });
}

// ------------------------------------------------------------- the mapping --

/**
 * A Places type -> our venue_type. Deliberately coarse: the app only needs to
 * know whether somewhere is a cafe, a place to study, or neither.
 */
const STUDY_TYPES = new Set(['library', 'book_store', 'coworking_space', 'university']);
const CAFE_TYPES = new Set([
  'cafe',
  'coffee_shop',
  'coffee_roastery',
  'coffee_stand',
  'tea_house',
  'tea_store',
  'bakery',
  'cafeteria',
  'internet_cafe',
]);

function venueType(place: Place): 'cafe' | 'study' | 'other' {
  const types = [place.primaryType, ...(place.types ?? [])].filter(Boolean) as string[];
  if (types.some((t) => STUDY_TYPES.has(t))) return 'study';
  if (types.some((t) => CAFE_TYPES.has(t))) return 'cafe';
  return 'other';
}

/**
 * Libraries and bookshops are quiet by definition; for anywhere else we do not
 * know, and guessing would put a wrong label on a real business. The filter
 * chip is honest about that: it only ever matches places we are sure about.
 */
function isQuiet(place: Place): boolean {
  const types = [place.primaryType, ...(place.types ?? [])].filter(Boolean) as string[];
  return types.some((t) => t === 'library' || t === 'book_store');
}

export interface VenueRow {
  googlePlaceId: string;
  name: string;
  lat: number;
  lng: number;
  type: 'cafe' | 'study' | 'other';
  address: string | null;
  vibeSummary: string | null;
  isQuiet: boolean;
  goodForGroups: boolean;
  rating: number | null;
  ratingCount: number | null;
  priceLevel: string | null;
  mapsUri: string | null;
  websiteUri: string | null;
  businessStatus: string | null;
  openNow: boolean | null;
}

/** A Place we can actually put on the map, or null if it is unusable. */
export function toVenueRow(place: Place): VenueRow | null {
  const id = place.id;
  const name = place.displayName?.text?.trim();
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  if (!id || !name || typeof lat !== 'number' || typeof lng !== 'number') return null;
  // A business that has shut down is worse than no result at all: someone would
  // walk to it. Temporarily closed places stay, flagged by business_status.
  if (place.businessStatus === 'CLOSED_PERMANENTLY') return null;

  return {
    googlePlaceId: id,
    name,
    lat,
    lng,
    type: venueType(place),
    address: place.shortFormattedAddress ?? place.formattedAddress ?? null,
    vibeSummary: place.editorialSummary?.text?.trim() || null,
    isQuiet: isQuiet(place),
    goodForGroups: place.goodForGroups ?? false,
    rating: place.rating ?? null,
    ratingCount: place.userRatingCount ?? null,
    priceLevel: place.priceLevel ?? null,
    mapsUri: place.googleMapsUri ?? null,
    websiteUri: place.websiteUri ?? null,
    businessStatus: place.businessStatus ?? null,
    openNow: place.currentOpeningHours?.openNow ?? null,
  };
}

// -------------------------------------------------------------- the upsert --

/**
 * Write the rows, keyed on the Google place id.
 *
 * `coalesce(excluded.x, venues.x)` on the describing columns: a later response
 * with a narrower field mask (atmosphere turned off, say) should not wipe a
 * description we already have. Position, name and the live-ish columns always
 * take the newest value.
 */
export async function upsertVenues(db: Db, rows: VenueRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  const result = await db.query(
    `insert into public.venues
       (google_place_id, source, name, lat, lng, type, address, vibe_summary,
        is_quiet, good_for_groups, rating, rating_count, price_level,
        maps_uri, website_uri, business_status, open_now, synced_at)
     select
       r.google_place_id, 'places', r.name, r.lat, r.lng, r.type::public.venue_type,
       r.address, r.vibe_summary, r.is_quiet, r.good_for_groups, r.rating,
       r.rating_count, r.price_level, r.maps_uri, r.website_uri,
       r.business_status, r.open_now, now()
     from jsonb_to_recordset($1::jsonb) as r(
       google_place_id text, name text, lat double precision, lng double precision,
       type text, address text, vibe_summary text, is_quiet boolean,
       good_for_groups boolean, rating real, rating_count integer,
       price_level text, maps_uri text, website_uri text, business_status text,
       open_now boolean)
     on conflict (google_place_id) where google_place_id is not null do update set
       name            = excluded.name,
       lat             = excluded.lat,
       lng             = excluded.lng,
       type            = excluded.type,
       address         = coalesce(excluded.address, public.venues.address),
       vibe_summary    = coalesce(excluded.vibe_summary, public.venues.vibe_summary),
       is_quiet        = excluded.is_quiet,
       good_for_groups = excluded.good_for_groups,
       rating          = coalesce(excluded.rating, public.venues.rating),
       rating_count    = coalesce(excluded.rating_count, public.venues.rating_count),
       price_level     = coalesce(excluded.price_level, public.venues.price_level),
       maps_uri        = coalesce(excluded.maps_uri, public.venues.maps_uri),
       website_uri     = coalesce(excluded.website_uri, public.venues.website_uri),
       business_status = excluded.business_status,
       open_now        = excluded.open_now,
       synced_at       = now()`,
    [
      JSON.stringify(
        rows.map((r) => ({
          google_place_id: r.googlePlaceId,
          name: r.name,
          lat: r.lat,
          lng: r.lng,
          type: r.type,
          address: r.address,
          vibe_summary: r.vibeSummary,
          is_quiet: r.isQuiet,
          good_for_groups: r.goodForGroups,
          rating: r.rating,
          rating_count: r.ratingCount,
          price_level: r.priceLevel,
          maps_uri: r.mapsUri,
          website_uri: r.websiteUri,
          business_status: r.businessStatus,
          open_now: r.openNow,
        })),
      ),
    ],
  );
  return result.rowCount ?? 0;
}

// ------------------------------------------------------------ the throttle --

/**
 * One in-flight sync per area, and a short memory of finished ones.
 *
 * The key rounds the centre to ~1 km, so a phone nudging the map re-uses the
 * last answer. Without this, every pan would be a billed Places call.
 */
export interface SyncResult {
  /** Rows written. 0 when Places is off, failing, or nothing matched. */
  written: number;
  /** The place ids Google matched, in its own ranking order. */
  placeIds: string[];
  /** False when the lookup did not happen or failed, so callers can fall back. */
  ok: boolean;
}

const MISS: SyncResult = { written: 0, placeIds: [], ok: false };

const inFlight = new Map<string, Promise<SyncResult>>();
const cache = new Map<string, { at: number; result: SyncResult }>();

function areaKey(area: Area): string {
  return [area.lat.toFixed(2), area.lng.toFixed(2), Math.round(area.radiusM / 500), area.query ?? '']
    .join(':');
}

function cached(area: Area): SyncResult | null {
  if (area.nocache) return null;
  const hit = cache.get(areaKey(area));
  if (!hit) return null;
  return Date.now() - hit.at < env.placesCacheMs ? hit.result : null;
}

/** True when this area was synced recently enough that Google would say the same. */
export function areaIsFresh(area: Area): boolean {
  return cached(area) !== null;
}

/**
 * Make sure the database knows about the places in `area`.
 *
 * Never throws: Places being off, rate-limited or unreachable resolves to a
 * result with `ok: false`, and the caller answers from the database instead.
 */
export function syncArea(area: Area): Promise<SyncResult> {
  if (!placesEnabled) return Promise.resolve(MISS);

  const key = areaKey(area);
  const running = inFlight.get(key);
  if (running) return running;

  const hit = cached(area);
  if (hit) return Promise.resolve(hit);

  const task = (async (): Promise<SyncResult> => {
    try {
      const places = area.query?.trim()
        ? await searchText(area, area.query.trim())
        : await searchNearby(area);
      const rows = places.map(toVenueRow).filter((r): r is VenueRow => r !== null);
      const written = await asSystem((db) => upsertVenues(db, rows));
      const result: SyncResult = { written, placeIds: rows.map((r) => r.googlePlaceId), ok: true };
      cache.set(key, { at: Date.now(), result });
      return result;
    } catch (err) {
      console.warn('[places] sync failed:', (err as Error).message);
      // Back off, but for a shorter window than a success: a transient failure
      // should be retried soon, while a bad key must not mean a Google call on
      // every single request.
      cache.set(key, { at: Date.now() - env.placesCacheMs + 30_000, result: MISS });
      return MISS;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, task);
  return task;
}

/** The area the map opens on, used by the background refresh job. */
export const DEFAULT_AREA: Area = {
  lat: env.placesDefaultLat,
  lng: env.placesDefaultLng,
  radiusM: env.placesRadiusM,
};

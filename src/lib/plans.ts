import { api } from './api';

/**
 * Hangout planning on public City of Calgary open data. The server retrieves
 * real places near where two people met, then Gemini turns a few of them into
 * plans. Every plan points at a real place; without AI it still returns the
 * best-matching places.
 */

export type PlaceKind = 'park' | 'library' | 'recreation' | 'public art' | 'community';

export interface CalgaryPlace {
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
  source: string;
  distanceKm: number;
}

/** Why there's no AI text: 'limited' / 'busy' carry retryAfterSec. */
export type AiStatus = 'ok' | 'cached' | 'off' | 'limited' | 'busy' | 'timeout' | 'error';

export interface HangoutPlan {
  title: string;
  plan: string;
  icebreaker: string | null;
  place: CalgaryPlace;
}

export interface HangoutsResponse {
  plans: HangoutPlan[];
  generated: boolean;
  aiStatus: AiStatus;
  retryAfterSec: number | null;
  source: string;
}

/** Ideas for meeting a connection again. `q` is an optional wish, e.g. "something outdoors". */
export async function fetchHangouts(connectionId: string, opts: { q?: string; day?: string } = {}) {
  const qs = new URLSearchParams();
  if (opts.q) qs.set('q', opts.q.slice(0, 80));
  if (opts.day) qs.set('day', opts.day);
  const suffix = qs.toString() ? `?${qs}` : '';
  return api.get<HangoutsResponse>(`/me/connections/${connectionId}/hangouts${suffix}`);
}

/** Public places near a venue that match some interests. No AI, no login. */
export async function fetchNearbyPlaces(venueId: string, interests: string[] = [], k = 8) {
  const qs = new URLSearchParams({ venueId, k: String(k) });
  if (interests.length) qs.set('q', interests.join(','));
  const res = await api.get<{ places: CalgaryPlace[] }>(`/calgary/places?${qs}`);
  return res.places;
}

// ---------------------------------------------------------------- itinerary --
export interface ItineraryStop {
  order: number;
  place: CalgaryPlace & { outdoor: boolean };
  walkMinFromPrev: number;
  arriveAt: string;
  leaveAt: string;
  /** Calgary time, e.g. "2:30 p.m." */
  arriveClock: string;
  leaveClock: string;
  what: string;
  icebreaker: string | null;
}

export interface ItineraryResponse {
  itinerary: {
    title: string;
    from: { name: string; lat: number; lng: number };
    startAt: string;
    endAt: string;
    stops: ItineraryStop[];
    notes: string[];
  } | null;
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
  /** Why there is no itinerary, ready to show. */
  message?: string;
}

type ItineraryOpts = { q?: string; /** "HH:MM" later today, Calgary time */ start?: string };

function itineraryQuery(opts: ItineraryOpts, extra: Record<string, string> = {}): string {
  const qs = new URLSearchParams(extra);
  if (opts.q) qs.set('q', opts.q.slice(0, 80));
  if (opts.start) qs.set('start', opts.start);
  return qs.toString() ? `?${qs}` : '';
}

/** Itinerary from the box where this (live or just-ended) conversation happened. */
export async function fetchConversationItinerary(opts: ItineraryOpts & { conversationId?: string } = {}) {
  const extra: Record<string, string> = opts.conversationId ? { id: opts.conversationId } : {};
  return api.get<ItineraryResponse>(`/me/conversation/itinerary${itineraryQuery(opts, extra)}`);
}

/** Itinerary for a connection, starting where the two of you first talked. */
export async function fetchConnectionItinerary(connectionId: string, opts: ItineraryOpts = {}) {
  return api.get<ItineraryResponse>(`/me/connections/${connectionId}/itinerary${itineraryQuery(opts)}`);
}

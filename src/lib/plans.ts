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

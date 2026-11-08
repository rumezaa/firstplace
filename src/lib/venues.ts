import { ApiError, api } from './api';
import type { BusyHour, CrowdTag, Venue, VenueLive, VenueTable } from './database.types';

export async function fetchVenues(): Promise<Venue[]> {
  return api.get<Venue[]>('/venues');
}

export async function fetchVenueLive(): Promise<Record<string, VenueLive>> {
  const rows = await api.get<VenueLive[]>('/venues/live');
  const byId: Record<string, VenueLive> = {};
  for (const row of rows) byId[row.venue_id] = row;
  return byId;
}

export async function fetchVenue(id: string): Promise<Venue | null> {
  try {
    return await api.get<Venue>(`/venues/${id}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function fetchVenueLiveOne(id: string): Promise<VenueLive | null> {
  return api.get<VenueLive | null>(`/venues/${id}/live`);
}

export async function fetchTables(venueId: string): Promise<VenueTable[]> {
  return api.get<VenueTable[]>(`/venues/${venueId}/tables`);
}

export async function fetchBusyHours(venueId: string): Promise<BusyHour[]> {
  return api.get<BusyHour[]>(`/venues/${venueId}/busy-hours`);
}

/**
 * Crowd type, aggregated. The view already suppresses any tag held by fewer
 * than 3 recent visitors, so there is nothing further to filter here.
 */
export async function fetchCrowdTags(venueId: string): Promise<CrowdTag[]> {
  return api.get<CrowdTag[]>(`/venues/${venueId}/crowd-tags`);
}

/** Staff tapping a tile on the kiosk grid. */
export async function setTableStatus(tableId: string, status: 'open' | 'taken'): Promise<void> {
  await api.patch(`/tables/${tableId}`, { status });
}

/**
 * Gemini's "what it's like inside right now", written from the same aggregate
 * counts everyone can already see. Falls back to the venue's insider info.
 */
export async function fetchVenueVibe(venueId: string): Promise<string | null> {
  const res = await api.get<{ vibe: string | null }>(`/venues/${venueId}/vibe`);
  return res.vibe;
}

// ---------------------------------------------------------------- filters ----

export interface VenueFilters {
  hasTables: boolean;
  chatTableActive: boolean;
  quiet: boolean;
  goodForGroups: boolean;
}

export const NO_FILTERS: VenueFilters = {
  hasTables: false,
  chatTableActive: false,
  quiet: false,
  goodForGroups: false,
};

export function filterVenues(
  venues: Venue[],
  live: Record<string, VenueLive>,
  filters: VenueFilters,
): Venue[] {
  return venues.filter((v) => {
    const l = live[v.id];
    if (filters.hasTables && (l?.open_tables ?? 0) < 1) return false;
    if (filters.chatTableActive && !l?.chat_table_active) return false;
    if (filters.quiet && !v.is_quiet) return false;
    if (filters.goodForGroups && !v.good_for_groups) return false;
    return true;
  });
}

export function activeFilterCount(filters: VenueFilters): number {
  return Object.values(filters).filter(Boolean).length;
}

/** Calgary. The map opens here before venues load. */
export const CALGARY_REGION = {
  latitude: 51.0447,
  longitude: -114.0719,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

import { supabase } from './supabase';
import type { BusyHour, CrowdTag, Venue, VenueLive, VenueTable } from './database.types';

export async function fetchVenues(): Promise<Venue[]> {
  const { data, error } = await supabase.from('venues').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function fetchVenueLive(): Promise<Record<string, VenueLive>> {
  const { data, error } = await supabase.from('venue_live').select('*');
  if (error) throw error;
  const byId: Record<string, VenueLive> = {};
  for (const row of data ?? []) byId[row.venue_id] = row;
  return byId;
}

export async function fetchVenue(id: string): Promise<Venue | null> {
  const { data, error } = await supabase.from('venues').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchVenueLiveOne(id: string): Promise<VenueLive | null> {
  const { data, error } = await supabase
    .from('venue_live')
    .select('*')
    .eq('venue_id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchTables(venueId: string): Promise<VenueTable[]> {
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('venue_id', venueId)
    .order('is_chat_table', { ascending: false })
    .order('label');
  if (error) throw error;
  return data ?? [];
}

export async function fetchBusyHours(venueId: string): Promise<BusyHour[]> {
  const { data, error } = await supabase
    .from('venue_busy_hours')
    .select('*')
    .eq('venue_id', venueId)
    .order('hour_of_day');
  if (error) throw error;
  return data ?? [];
}

/**
 * Crowd type, aggregated. The view already suppresses any tag held by fewer
 * than 3 recent visitors, so there is nothing further to filter here.
 */
export async function fetchCrowdTags(venueId: string): Promise<CrowdTag[]> {
  const { data, error } = await supabase
    .from('venue_crowd_tags')
    .select('*')
    .eq('venue_id', venueId)
    .order('people', { ascending: false })
    .limit(5);
  if (error) throw error;
  return data ?? [];
}

/** Staff tapping a tile on the kiosk grid. */
export async function setTableStatus(tableId: string, status: 'open' | 'taken'): Promise<void> {
  const { error } = await supabase.from('tables').update({ status }).eq('id', tableId);
  if (error) throw error;
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

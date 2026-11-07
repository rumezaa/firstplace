import { supabase } from './supabase';
import type { Reward, Venue } from './database.types';

/**
 * Visits needed at one cafe to earn a frequent-visit reward.
 *
 * TODO(rewards): this lives here only because public.recompute_rewards() is
 * still a stub. When the function is written, decide whether the target moves
 * into the database (so `status` can flip to 'earned' server-side) or stays
 * here as presentation. Pick one — having it in both places will drift.
 */
export const FREQUENT_REWARD_TARGET = 10;

/** A check-in at the venue's chat table counts double. */
export const CHAT_TABLE_VISIT_WEIGHT = 2;

export async function fetchRewards(): Promise<Reward[]> {
  const { data, error } = await supabase.from('rewards').select('*');
  if (error) throw error;
  return data ?? [];
}

/**
 * Which venues the signed-in user has visited, for the passport grid.
 *
 * Read from their own check-ins rather than from an aggregate: RLS already
 * limits `checkins` to your own rows, so this is both allowed and private.
 */
export async function fetchVisitedVenueIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from('checkins').select('venue_id');
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.venue_id));
}

export interface PassportEntry {
  venue: Venue;
  visited: boolean;
}

export function buildPassport(venues: Venue[], visited: Set<string>): PassportEntry[] {
  return venues.map((venue) => ({ venue, visited: visited.has(venue.id) }));
}

export function frequentProgress(rewards: Reward[], venueId: string): number {
  return rewards.find((r) => r.type === 'frequent' && r.venue_id === venueId)?.progress ?? 0;
}

export function passportProgress(rewards: Reward[]): number {
  return rewards.find((r) => r.type === 'passport')?.progress ?? 0;
}

export function progressFraction(progress: number, target = FREQUENT_REWARD_TARGET): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(1, progress / target));
}

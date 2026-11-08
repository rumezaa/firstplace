import { api } from './api';
import type { Reward, Venue } from './database.types';

/**
 * Visits needed at one cafe to earn a frequent-visit reward.
 *
 * TODO(rewards): this lives here only because public.recompute_rewards() is
 * still a stub. When the function is written, decide whether the target moves
 * into the database (so `status` can flip to 'earned' server-side) or stays
 * here as presentation. Pick one — having it in both places will drift.
 */
export const FREQUENT_REWARD_TARGET = 5; // project doc: 5 visits = a free drink

/** A check-in at the venue's chat table counts double. */
export const CHAT_TABLE_VISIT_WEIGHT = 2;

export async function fetchRewards(): Promise<Reward[]> {
  return api.get<Reward[]>('/me/rewards');
}

/**
 * Which venues the signed-in user has visited, for the passport grid.
 *
 * Read from their own check-ins rather than from an aggregate: RLS already
 * limits `checkins` to your own rows, so this is both allowed and private.
 */
export async function fetchVisitedVenueIds(): Promise<Set<string>> {
  return new Set(await api.get<string[]>('/me/visited-venues'));
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

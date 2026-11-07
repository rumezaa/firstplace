import { supabase } from './supabase';
import type { FamiliarFaceCard } from './database.types';
import { weekdayName } from './format';

/**
 * Reads through public.my_familiar_faces() rather than the table, because the
 * function is the thing that enforces the privacy rule: it strips the other
 * person's user id, and only returns a first name once both sides accepted.
 */
export async function fetchFamiliarFaces(): Promise<FamiliarFaceCard[]> {
  const { data, error } = await supabase.rpc('my_familiar_faces');
  if (error) throw error;
  return (data ?? []) as FamiliarFaceCard[];
}

export async function respondToFamiliarFace(id: string, accept: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('respond_to_familiar_face', {
    p_id: id,
    p_accept: accept,
  });
  if (error) throw error;
  return Boolean((data as { mutual?: boolean } | null)?.mutual);
}

export type FaceState = 'pending' | 'waiting_on_them' | 'mutual';

export function faceState(card: FamiliarFaceCard): FaceState {
  if (card.mutual) return 'mutual';
  if (card.i_accepted) return 'waiting_on_them';
  return 'pending';
}

/**
 * The card headline. Before mutual acceptance it must never name anyone, so
 * the copy is deliberately "another regular".
 */
export function faceHeadline(card: FamiliarFaceCard): string {
  if (card.mutual && card.their_first_name) {
    return `You and ${card.their_first_name} both said yes`;
  }
  return `You and another regular keep crossing paths at ${card.venue_name}`;
}

export function faceDetail(card: FamiliarFaceCard): string {
  const when = weekdayName(card.common_weekday);
  const times = `${card.overlap_count} ${card.overlap_count === 1 ? 'time' : 'times'}`;

  switch (faceState(card)) {
    case 'mutual':
      return `You have overlapped ${times} at ${card.venue_name}, mostly on ${when}. Say hello at the chat table next time you are both in.`;
    case 'waiting_on_them':
      return `You said yes. We will let you know if they do too. Nothing is shared until then.`;
    case 'pending':
      return `You have been there at the same time ${times}, mostly on ${when}. If you both say yes, you will see each other's first names.`;
  }
}

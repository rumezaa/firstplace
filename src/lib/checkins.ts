import { supabase } from './supabase';
import type { Checkin } from './database.types';

/** Matches the `hint` tokens raised by public.check_in(). */
export const CHECKIN_ERROR_HINTS = {
  codeInvalid: 'kiosk_code_invalid',
  tableNotAtVenue: 'table_not_at_venue',
  tableTaken: 'table_taken',
} as const;

export interface CheckInResult extends Checkin {
  at_chat_table: boolean;
}

/**
 * The whole check-in happens in one database call: validate the kiosk code,
 * claim the table, close any previous session, insert the check-in. Doing it
 * client-side in several steps would let two people claim the same table.
 */
export async function checkIn(args: {
  code: string;
  tableId: string;
  openToChat: boolean;
}): Promise<CheckInResult> {
  const { data, error } = await supabase.rpc('check_in', {
    p_code: args.code,
    p_table_id: args.tableId,
    p_open_to_chat: args.openToChat,
  });
  if (error) throw error;
  return data as unknown as CheckInResult;
}

export async function checkOut(): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_out');
  if (error) throw error;
  return Boolean((data as { checked_out?: boolean } | null)?.checked_out);
}

/** The user's open session, if they have one. */
export async function fetchOpenCheckin(): Promise<Checkin | null> {
  const { data, error } = await supabase
    .from('checkins')
    .select('*')
    .is('checked_out_at', null)
    .order('checked_in_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface CheckinHistoryRow extends Checkin {
  venues: { name: string } | null;
  tables: { label: string; is_chat_table: boolean } | null;
}

export async function fetchCheckinHistory(limit = 30): Promise<CheckinHistoryRow[]> {
  const { data, error } = await supabase
    .from('checkins')
    .select('*, venues(name), tables(label, is_chat_table)')
    .order('checked_in_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as CheckinHistoryRow[];
}

export async function setOpenToChat(checkinId: string, openToChat: boolean): Promise<void> {
  const { error } = await supabase
    .from('checkins')
    .update({ open_to_chat: openToChat })
    .eq('id', checkinId);
  if (error) throw error;
}

/**
 * Nudge the 3-hour auto check-out along.
 *
 * The aggregate views already ignore sessions older than 3 hours, so counts
 * are right either way; this is what frees the table rows. Once pg_cron is
 * scheduled (see migration 0400) this call can go away.
 */
export async function sweepStaleCheckins(): Promise<void> {
  const { error } = await supabase.rpc('auto_checkout_stale');
  if (error && __DEV__) console.warn('[checkins] stale sweep failed', error.message);
}

// --------------------------------------------------------- QR code payload ---

/**
 * What the kiosk encodes and the scanner decodes.
 *
 * A URL rather than a bare code so that a phone's built-in camera app can deep
 * link into the app too. The parser stays tolerant: if someone types the code
 * by hand, or a QR library hands back just the code, that still works.
 */
export function kioskQrPayload(venueId: string, code: string): string {
  return `thirdplace://checkin?venue=${venueId}&code=${code}`;
}

export function parseKioskQr(raw: string): { code: string; venueId: string | null } | null {
  const text = raw.trim();
  if (!text) return null;

  const match = text.match(/code=([0-9A-Fa-f]{8})/);
  if (match) {
    const venue = text.match(/venue=([0-9a-fA-F-]{36})/);
    return { code: match[1].toUpperCase(), venueId: venue ? venue[1] : null };
  }

  // Bare 8-character code, hand-typed or from a plain-text QR.
  if (/^[0-9A-Fa-f]{8}$/.test(text)) {
    return { code: text.toUpperCase(), venueId: null };
  }

  return null;
}

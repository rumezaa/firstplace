import { api } from './api';
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
  return api.post<CheckInResult>('/checkins', args);
}

export async function checkOut(): Promise<boolean> {
  const res = await api.post<{ checked_out?: boolean }>('/checkins/checkout');
  return Boolean(res?.checked_out);
}

/** The user's open session, if they have one. */
export async function fetchOpenCheckin(): Promise<Checkin | null> {
  return api.get<Checkin | null>('/me/checkins/open');
}

export interface CheckinHistoryRow extends Checkin {
  venues: { name: string } | null;
  tables: { label: string; is_chat_table: boolean } | null;
}

export async function fetchCheckinHistory(limit = 30): Promise<CheckinHistoryRow[]> {
  return api.get<CheckinHistoryRow[]>(`/me/checkins?limit=${limit}`);
}

export async function setOpenToChat(checkinId: string, openToChat: boolean): Promise<void> {
  await api.patch(`/checkins/${checkinId}`, { openToChat });
}

/**
 * The 3-hour auto check-out now runs on the server every 5 minutes
 * (server/src/jobs.ts). Kept as a no-op so existing callers don't change.
 */
export async function sweepStaleCheckins(): Promise<void> {}

// --------------------------------------------------------- QR code payload ---

/**
 * What the kiosk encodes and the scanner decodes.
 *
 * A URL rather than a bare code so that a phone's built-in camera app can deep
 * link into the app too. The parser stays tolerant: if someone types the code
 * by hand, or a QR library hands back just the code, that still works.
 */
export function kioskQrPayload(venueId: string, code: string): string {
  return `firstplace://checkin?venue=${venueId}&code=${code}`;
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

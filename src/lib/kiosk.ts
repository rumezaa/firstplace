import { supabase } from './supabase';

/** How often the kiosk mints a new code. The brief asks for 30 seconds. */
export const KIOSK_ROTATE_SECONDS = 30;

/**
 * Codes live longer than the rotation interval so a scan that lands just as
 * the QR changes still validates. Keep this comfortably above
 * KIOSK_ROTATE_SECONDS or people will see "that code has expired" for no
 * apparent reason.
 */
export const KIOSK_CODE_TTL_SECONDS = 60;

export interface KioskCode {
  code: string;
  expiresAt: string;
}

export async function rotateKioskCode(venueId: string): Promise<KioskCode> {
  const { data, error } = await supabase.rpc('rotate_kiosk_code', {
    p_venue_id: venueId,
    p_ttl_seconds: KIOSK_CODE_TTL_SECONDS,
  });
  if (error) throw error;
  const row = data as { code: string; expires_at: string };
  return { code: row.code, expiresAt: row.expires_at };
}

// ------------------------------------------------------------- dashboard -----

export interface VenueDashboardSuppressed {
  suppressed: true;
  min_group_size: number;
  days: number;
}

export interface VenueDashboardData {
  suppressed: false;
  min_group_size: number;
  days: number;
  visitors: number;
  total_visits: number;
  repeat_visit_rate: number;
  chat_table_visits: number;
  open_to_chat_visits: number;
  peak_hours: { hour: number; visits: number }[];
}

export type VenueDashboard = VenueDashboardSuppressed | VenueDashboardData;

/**
 * Aggregates only, and the database refuses to return any number at all when
 * fewer than `min_group_size` distinct people visited in the window. The
 * client never gets the chance to show individual users because it is never
 * sent them.
 */
export async function fetchVenueDashboard(venueId: string, days = 30): Promise<VenueDashboard> {
  const { data, error } = await supabase.rpc('venue_dashboard', {
    p_venue_id: venueId,
    p_days: days,
  });
  if (error) throw error;
  return data as unknown as VenueDashboard;
}

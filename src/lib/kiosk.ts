import { api } from './api';

/** How often the kiosk mints a new code. The brief asks for 30 seconds. */
export const KIOSK_ROTATE_SECONDS = 30;

/**
 * Codes live longer than the rotation interval so a scan that lands just as
 * the QR changes still validates. Keep this comfortably above
 * KIOSK_ROTATE_SECONDS or people will see "that code has expired" for no
 * apparent reason.
 */
export const KIOSK_CODE_TTL_SECONDS = 45; // project doc: rotate 30s, expire 45s

export interface KioskCode {
  code: string;
  expiresAt: string;
}

export async function rotateKioskCode(venueId: string): Promise<KioskCode> {
  const row = await api.post<{ code: string; expires_at: string }>(`/kiosk/${venueId}/code`, {
    ttlSeconds: KIOSK_CODE_TTL_SECONDS,
  });
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
  return api.get<VenueDashboard>(`/dashboard/${venueId}?days=${days}`);
}

/** Gemini tip for the owner, from the same aggregates. Null when suppressed. */
export async function fetchDashboardInsight(venueId: string): Promise<string | null> {
  const res = await api.get<{ insight: string | null }>(`/dashboard/${venueId}/insight`);
  return res.insight;
}

import { api } from './api';

/**
 * The PRD's core loop, client side: tap a box → claim it or join/request →
 * talk with shared topics → private vote. Every rule (who can join, what a
 * request card shows, how votes stay private) is enforced by the server; this
 * file only names the calls.
 */

export type Light = 'green' | 'yellow' | 'red';
export type BoxLight = Light | 'off';

export interface TableView {
  table: {
    id: string;
    label: string;
    seats: number;
    is_chat_table: boolean;
    box_enabled: boolean;
    venue_id: string;
    venue_name: string;
  };
  light: BoxLight;
  /** Only ever the caller's own claim at this table. */
  mine: { light: Light; away_until: string | null } | null;
  /** False overnight (10pm to 6am), when no table can be claimed. */
  boxes_open?: boolean;
}

export interface Shared {
  interests: string[];
  topics: string[];
  languages: string[];
}

export interface RequestCard {
  id: string;
  first_name: string | null;
  age_range: string | null;
  verified: boolean;
  shared: Shared;
  comm_pref: string | null;
  expires_at: string;
}

export interface Conversation {
  id: string;
  via: 'green' | 'request';
  started_at: string;
  ends_at: string | null;
  ended_at: string | null;
  their_first_name: string | null;
  shared: Shared;
  my_vote: 'good' | 'not_for_me' | null;
  my_extend: boolean | null;
  connected: boolean;
}

export interface Connection {
  id: string;
  first_name: string | null;
  shared: Shared;
  created_at: string;
  venue_name: string | null;
}

export const LIGHT_INFO: Record<BoxLight, { label: string; meaning: string; symbol: string; pattern: string }> = {
  green: { label: 'Green', meaning: 'Open to talk to anyone', symbol: '✓', pattern: 'steady' },
  yellow: { label: 'Yellow', meaning: 'Open to talk, but I choose who', symbol: '?', pattern: 'slow pulse' },
  red: { label: 'Red', meaning: 'Not open right now', symbol: '✕', pattern: 'solid' },
  off: { label: 'Off', meaning: 'Just a table', symbol: '–', pattern: 'dark' },
};

// ------------------------------------------------------------------- box ---
export const fetchTableView = (tableId: string) => api.get<TableView>(`/tables/${tableId}/view`);
export const claimTable = (tableId: string, light: Light = 'yellow') =>
  api.post<{ light: Light }>(`/tables/${tableId}/claim`, { light });
export const setLight = (light: Light) => api.post<{ light: Light }>('/me/light', { light });
export const stepAway = () => api.post<{ away_until: string }>('/me/step-away');
export const leaveNow = () => api.post<{ left: boolean }>('/me/leave-now');

// --------------------------------------------------------------- joining ---
export const joinGreen = (tableId: string) =>
  api.post<{ conversation_id: string }>(`/tables/${tableId}/join`);
export const requestChat = (tableId: string) =>
  api.post<{ request_id: string; expires_at: string }>(`/tables/${tableId}/request`);
export const fetchRequestStatus = (requestId: string) =>
  api.get<{ status: 'pending' | 'accepted' | 'not_available'; conversation_id?: string }>(`/requests/${requestId}`);
export const cancelRequest = (requestId: string) =>
  api.post<{ cancelled: boolean }>(`/requests/${requestId}/cancel`);
export const fetchIncomingRequests = () => api.get<RequestCard[]>('/me/requests');
export const respondToRequest = (requestId: string, accept: boolean, minutes = 30) =>
  api.post<{ accepted: boolean; conversation_id?: string }>(`/requests/${requestId}/respond`, { accept, minutes });

// ---------------------------------------------------------- conversation ---
export const fetchConversation = (id?: string) =>
  api.get<Conversation | null>(`/me/conversation${id ? `?id=${id}` : ''}`);
export const fetchTopics = () =>
  api.get<{ shared: Shared; prompts: string[] }>('/me/conversation/topics');
export const endConversation = () => api.post<{ ended: boolean; conversation_id?: string }>('/me/conversation/end');
export const voteExtend = (extend: boolean) =>
  api.post<{ status: 'extended' | 'wrapped_up' | 'waiting' }>('/me/conversation/extend', { extend });
export const voteConversation = (id: string, vote: 'good' | 'not_for_me') =>
  api.post(`/conversations/${id}/vote`, { vote });
export const fetchConnections = () => api.get<Connection[]>('/me/connections');

// ---------------------------------------------------------------- safety ---
export type ReportReason = 'uncomfortable' | 'would_not_leave' | 'inappropriate' | 'romantic_unwanted' | 'other';
export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'uncomfortable', label: 'Made me uncomfortable' },
  { value: 'would_not_leave', label: "Wouldn't leave" },
  { value: 'inappropriate', label: 'Inappropriate behaviour' },
  { value: 'romantic_unwanted', label: 'Turned it romantic or sexual when I didn’t want that' },
  { value: 'other', label: 'Something else' },
];
export const reportUser = (conversationId: string, reason: ReportReason, note?: string) =>
  api.post(`/conversations/${conversationId}/report`, { reason, note });
export const blockUser = (conversationId: string) => api.post(`/conversations/${conversationId}/block`);

// -------------------------------------------------------------- box codes ---
/** What a box's NFC tag / printed QR holds: a link with the table id. */
export function boxLink(tableId: string): string {
  return `firstplace://table/${tableId}`;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Pull a table id out of a scanned box code (link, URL or bare id). */
export function parseBoxCode(raw: string): string | null {
  const text = raw.trim();
  if (!/table/i.test(text) && !UUID.test(text)) return null;
  return text.match(UUID)?.[0].toLowerCase() ?? null;
}

/** "12:04" left, or null when untimed. */
export function timeLeft(endsAt: string | null, now = Date.now()): { ms: number; label: string } | null {
  if (!endsAt) return null;
  const ms = Math.max(0, new Date(endsAt).getTime() - now);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return { ms, label: `${m}:${String(s).padStart(2, '0')}` };
}

// ----------------------------------------------------------------- floor ---
/** One table on a floor, as the NFC floor view shows it. Colours only. */
export interface FloorTable {
  id: string;
  label: string;
  seats: number;
  is_chat_table: boolean;
  box_enabled: boolean;
  light: BoxLight;
  mine: boolean;
  /** 0..1 across the floor outline; null = not placed on the map. */
  pos_x: number | null;
  pos_y: number | null;
}
export const fetchFloor = (venueId: string) => api.get<FloorTable[]>(`/venues/${venueId}/floor`);

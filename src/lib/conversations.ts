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

export type Vote = 'good' | 'not_for_me';

/**
 * Where a socials swap with one person stands, from my side. A decline is
 * never shown: it stays 'asked'.
 */
export type SwapState = 'can_ask' | 'asked' | 'they_asked' | 'swapped' | 'closed' | 'none';

/** Someone in the conversation. `member_id` is per conversation; user ids never reach the app. */
export interface Member {
  member_id: string;
  first_name: string | null;
  is_me: boolean;
  /** Still in the conversation (false once they left). */
  here: boolean;
  /** My own private vote about them. Their vote is never sent. */
  my_vote: Vote | null;
  /** Both voted good. */
  connected: boolean;
  swap: SwapState | null;
}

export type EndReason = 'ended' | 'timer' | 'everyone_left' | 'reported' | 'nightly';

export interface Conversation {
  id: string;
  via: 'green' | 'request';
  started_at: string;
  ends_at: string | null;
  ended_at: string | null;
  end_reason: EndReason | null;
  i_am_host: boolean;
  my_member_id: string;
  /** What at least two people in the group listed (for two people: their overlap). */
  shared: Shared;
  /** It ends once `wanting` reaches `needed` (half of those `present`). */
  end_votes: { wanting: number; present: number; needed: number; me: boolean };
  my_extend: boolean | null;
  members: Member[];
  /** Older single-partner fields, still sent. */
  their_first_name: string | null;
  my_vote: Vote | null;
  connected: boolean;
}

export interface SwapRequest {
  id: string;
  first_name: string | null;
  venue_name: string | null;
  met_at: string | null;
  shared: Shared;
}

export type Socials = Partial<Record<'instagram' | 'discord' | 'snapchat' | 'tiktok' | 'linkedin' | 'x' | 'phone' | 'email' | 'other', string>>;

export interface Contact {
  id: string;
  first_name: string | null;
  socials: Socials;
  venue_name: string | null;
  met_at: string | null;
  connected: boolean;
}

export interface HistoryEntry {
  id: string;
  venue_name: string | null;
  table_label: string | null;
  started_at: string;
  ended_at: string;
  minutes: number;
  people: number;
  end_reason: EndReason | null;
  connected_with: string[];
  swapped: number;
}

export interface Connection {
  id: string;
  first_name: string | null;
  shared: Shared;
  created_at: string;
  venue_name: string | null;
  /** Only once you've swapped socials. */
  socials: Socials | null;
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
export const fetchIncomingRequests = () => api.get<RequestCard[]>('/me/requests');
export const respondToRequest = (requestId: string, accept: boolean, minutes = 30) =>
  api.post<{ accepted: boolean; conversation_id?: string }>(`/requests/${requestId}/respond`, { accept, minutes });

// ---------------------------------------------------------- conversation ---
export const fetchConversation = (id?: string) =>
  api.get<Conversation | null>(`/me/conversation${id ? `?id=${id}` : ''}`);
export const fetchTopics = () =>
  api.get<{ shared: Shared; prompts: string[] }>('/me/conversation/topics');
/** Tap End. It ends once at least half of the people still here have tapped End. */
export const endConversation = () =>
  api.post<{ ended: boolean; conversation_id: string | null; wanting?: number; present?: number; needed?: number }>('/me/conversation/end');
export const keepTalking = () => api.post<{ ok: boolean }>('/me/conversation/keep-talking');
/** Leave on your own; the others carry on (it ends if only one is left). */
export const leaveConversation = () => api.post<{ left: boolean }>('/me/conversation/leave');
export const voteExtend = (extend: boolean) =>
  api.post<{ status: 'extended' | 'wrapped_up' | 'waiting' }>('/me/conversation/extend', { extend });
export const voteConversation = (id: string, vote: Vote) =>
  api.post(`/conversations/${id}/vote`, { vote });
/** Private vote about one person. `connected` is true only when you both said good. */
export const voteMember = (conversationId: string, memberId: string, vote: Vote) =>
  api.post<{ recorded: boolean; connected: boolean }>(`/conversations/${conversationId}/members/${memberId}/vote`, { vote });
export const fetchConnections = () => api.get<Connection[]>('/me/connections');

// --------------------------------------------------------- socials swap ---
/** Ask once to swap socials (after voting good). 'swapped' if they had already asked. */
export const requestSwap = (conversationId: string, memberId: string) =>
  api.post<{ status: 'asked' | 'swapped' }>(`/conversations/${conversationId}/members/${memberId}/swap`);
export const fetchSwapRequests = () => api.get<SwapRequest[]>('/me/swap-requests');
export const respondToSwap = (swapId: string, accept: boolean) =>
  api.post<{ swapped: boolean }>(`/swaps/${swapId}/respond`, { accept });
export const fetchContacts = () => api.get<Contact[]>('/me/contacts');
export const fetchHistory = (limit = 30) => api.get<HistoryEntry[]>(`/me/history?limit=${limit}`);

// ---------------------------------------------------------------- safety ---
export type ReportReason = 'uncomfortable' | 'would_not_leave' | 'inappropriate' | 'romantic_unwanted' | 'other';
export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'uncomfortable', label: 'Made me uncomfortable' },
  { value: 'would_not_leave', label: "Wouldn't leave" },
  { value: 'inappropriate', label: 'Inappropriate behaviour' },
  { value: 'romantic_unwanted', label: 'Turned it romantic or sexual when I didn’t want that' },
  { value: 'other', label: 'Something else' },
];
/** Anonymous: flags their profile for review, blocks them, and takes you out of the conversation. */
export const reportMember = (conversationId: string, memberId: string, reason: ReportReason, note?: string) =>
  api.post(`/conversations/${conversationId}/members/${memberId}/report`, { reason, note });
export const blockMember = (conversationId: string, memberId: string) =>
  api.post(`/conversations/${conversationId}/members/${memberId}/block`);
/** Two-person form of reportMember. */
export const reportUser = (conversationId: string, reason: ReportReason, note?: string) =>
  api.post(`/conversations/${conversationId}/report`, { reason, note });
export const blockUser = (conversationId: string) => api.post(`/conversations/${conversationId}/block`);

export const SOCIAL_LABELS: Record<keyof Socials, string> = {
  instagram: 'Instagram', discord: 'Discord', snapchat: 'Snapchat', tiktok: 'TikTok',
  linkedin: 'LinkedIn', x: 'X', phone: 'Phone', email: 'Email', other: 'Other',
};

export function endReasonLabel(r: EndReason | null): string {
  switch (r) {
    case 'timer': return 'Timer ran out';
    case 'everyone_left': return 'Everyone left';
    case 'reported': return 'Ended after a report';
    case 'nightly': return 'Closed for the night';
    default: return 'Ended together';
  }
}

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

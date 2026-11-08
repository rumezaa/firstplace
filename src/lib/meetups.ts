import { api } from './api';
import type { Shared } from './conversations';

/**
 * Planning the second meeting, client side.
 *
 * The flow is deliberately a handshake, not a broadcast:
 *   open → each person ticks the windows that work for them → once BOTH have,
 *   the overlap appears → build a plan → both say yes → confirmed.
 *
 * You never see the other person's windows, only the ones you both ticked.
 * That rule is enforced in Postgres (db/migrations/100_meetups.sql), not here.
 */

export type PartOfDay = 'morning' | 'afternoon' | 'evening';

export const PARTS: PartOfDay[] = ['morning', 'afternoon', 'evening'];

export const PART_LABEL: Record<PartOfDay, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

export type MeetupStatus = 'collecting' | 'proposed' | 'confirmed' | 'declined' | 'expired';

export interface ForecastWindow {
  day: string;
  part: PartOfDay;
  tempC: number;
  feelsLikeC: number;
  precipProb: number;
  windKph: number;
  snowCm: number;
  daylight: number;
  /** 0..1 — how pleasant it is to be outside. Drives the picker's weather dot. */
  outdoorScore: number;
  headline: string;
}

export interface Slot {
  day: string;
  part: PartOfDay;
}

export interface MeetupPlan {
  day: string;
  part: PartOfDay;
  when: string;
  idea: {
    id: string;
    title: string;
    blurb: string;
    exposure: 'indoor' | 'covered' | 'outdoor';
    energy: number;
    cost: 'free' | 'cheap' | 'moderate';
  };
  venue: { id: string; name: string; address: string | null } | null;
  area: string | null;
  weather: ForecastWindow | null;
  weatherSource: 'open-meteo' | 'unavailable';
  sharedInterests: string[];
  why: string[];
  backup: { title: string; blurb: string; venue: string | null; reason: string } | null;
  alternatives: { day: string; part: PartOfDay; when: string; title: string }[];
  score: number;
  /** Gemini's opening line. Null when Gemini is not configured or is down. */
  invitation: string | null;
  builtAt: string;
}

export interface Overlap {
  ready: boolean;
  /** 'you' and 'them' are whose turn it is; 'no_overlap' means try more times. */
  waiting_on: 'you' | 'them' | 'no_overlap' | null;
  mine: number;
  windows: Slot[];
}

export interface MeetupView {
  meetup_id: string;
  status: MeetupStatus;
  shared: Shared;
  their_first_name: string | null;
  met_at: { id: string; name: string; lat: number; lng: number } | null;
  overlap: Overlap;
  /** My own ticks, so the picker reopens where I left it. Never theirs. */
  my_windows: Slot[];
  plan: MeetupPlan | null;
  i_accepted: boolean;
  they_accepted: boolean;
  horizon_days: number;
  today: string;
  forecast: ForecastWindow[];
  forecast_available: boolean;
}

export interface MeetupSummary {
  id: string;
  connection_id: string;
  their_first_name: string | null;
  status: MeetupStatus;
  plan: MeetupPlan | null;
  i_accepted: boolean;
  they_accepted: boolean;
  created_at: string;
}

// ------------------------------------------------------------------ calls ---
export const openMeetup = (connectionId: string) =>
  api.post<{ meetup_id: string }>(`/connections/${connectionId}/meetup`);
export const fetchMeetup = (id: string) => api.get<MeetupView>(`/meetups/${id}`);
export const fetchOverlap = (id: string) => api.get<Overlap>(`/meetups/${id}/overlap`);
export const saveAvailability = (id: string, slots: Slot[]) =>
  api.post<{ saved: number }>(`/meetups/${id}/availability`, { slots });
export const buildPlan = (id: string) =>
  api.post<{ status: 'proposed'; plan: MeetupPlan }>(`/meetups/${id}/plan`);
export const respondToMeetup = (id: string, accept: boolean) =>
  api.post<{ status: MeetupStatus; waiting_on?: string }>(`/meetups/${id}/respond`, { accept });
export const cancelMeetup = (id: string) => api.post<{ status: MeetupStatus }>(`/meetups/${id}/cancel`);
export const fetchMyMeetups = () => api.get<MeetupSummary[]>('/me/meetups');

// ----------------------------------------------------------------- display ---
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The days the picker offers: today plus the rest of the forecast. */
export function daysFrom(today: string, count: number): string[] {
  const [y, m, d] = today.split('-').map(Number);
  if (!y || !m || !d) return [];
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(y, m - 1, d + i, 12));
    return date.toISOString().slice(0, 10);
  });
}

/** "Mon 10" for a chip header, "Today" / "Tomorrow" when it is close. */
export function dayLabel(day: string, today: string): string {
  const at = (s: string): number => Date.UTC(
    Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)), 12,
  );
  const diff = Math.round((at(day) - at(today)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  const date = new Date(at(day));
  return `${DAY_NAMES[date.getUTCDay()] ?? ''} ${date.getUTCDate()}`;
}

export const slotKey = (s: Slot): string => `${s.day}|${s.part}`;

/**
 * How a window's weather reads at a glance.
 *
 * Deliberately not the traffic-light green/yellow/red: in this app those three
 * colours mean the box light and nothing else (see the design kit note in
 * global.css), so the picker uses words plus the sage/amber/brick tones that
 * Badge already owns for non-light information.
 */
export function weatherTone(w: ForecastWindow | null): 'neutral' | 'open' | 'filling' | 'full' {
  if (!w) return 'neutral';
  if (w.outdoorScore >= 0.7) return 'open';
  if (w.outdoorScore >= 0.4) return 'filling';
  return 'full';
}

/** A two-or-three word summary for the picker chip. */
export function weatherShort(w: ForecastWindow | null): string {
  if (!w) return '';
  const t = `${Math.round(w.tempC)}°`;
  if (w.snowCm >= 0.5) return `${t} snow`;
  if (w.precipProb >= 40) return `${t} wet`;
  if (w.windKph >= 35) return `${t} windy`;
  if (w.outdoorScore >= 0.7) return `${t} nice`;
  return t;
}

export const COST_LABEL: Record<MeetupPlan['idea']['cost'], string> = {
  free: 'Free',
  cheap: 'Cheap',
  moderate: 'Costs a bit',
};

export const EXPOSURE_LABEL: Record<MeetupPlan['idea']['exposure'], string> = {
  indoor: 'Indoors',
  covered: 'Mostly indoors',
  outdoor: 'Outdoors',
};

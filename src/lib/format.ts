/** Postgres extract(dow): 0 = Sunday. */
const WEEKDAYS = [
  'Sundays',
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
] as const;

export function weekdayName(dow: number | null | undefined): string {
  if (dow === null || dow === undefined) return 'the same days';
  return WEEKDAYS[dow] ?? 'the same days';
}

/** 0 -> "12am", 13 -> "1pm". Used by the busiest-hours bars. */
export function hourLabel(hour: number): string {
  const h = ((hour % 12) + 12) % 12;
  return `${h === 0 ? 12 : h}${hour < 12 ? 'am' : 'pm'}`;
}

export function timeOfDay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function relativeDay(iso: string): string {
  const then = new Date(iso);
  const days = Math.floor((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  return shortDate(iso);
}

/** "1 person" / "3 people" — small thing, but it shows up all over the UI. */
export function people(n: number): string {
  return n === 1 ? '1 person' : `${n} people`;
}

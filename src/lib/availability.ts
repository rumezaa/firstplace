import type { Availability } from './database.types';
import { colors } from './theme';

interface AvailabilityPresentation {
  label: string;
  /** For the map marker pin, which cannot take a className. */
  pinColor: string;
  /** Tailwind classes for chips and badges. */
  badgeClass: string;
  textClass: string;
  /** Screen-reader wording. Never relies on colour alone. */
  a11y: string;
}

export const AVAILABILITY: Record<Availability, AvailabilityPresentation> = {
  open: {
    label: 'Tables open',
    pinColor: colors.sage,
    badgeClass: 'bg-sage-soft',
    textClass: 'text-sage',
    a11y: 'Tables available',
  },
  filling_up: {
    label: 'Filling up',
    pinColor: colors.amber,
    badgeClass: 'bg-amber-soft',
    textClass: 'text-amber',
    a11y: 'Filling up, a few tables left',
  },
  full: {
    label: 'Full',
    pinColor: colors.brick,
    badgeClass: 'bg-brick-soft',
    textClass: 'text-brick',
    a11y: 'Full, no tables available',
  },
};

export function availabilityOf(live: { availability?: Availability } | null | undefined): Availability {
  return live?.availability ?? 'open';
}

/** "4 of 7 tables open" */
export function tablesSummary(open: number, total: number): string {
  if (total === 0) return 'No table map yet';
  return `${open} of ${total} ${total === 1 ? 'table' : 'tables'} open`;
}

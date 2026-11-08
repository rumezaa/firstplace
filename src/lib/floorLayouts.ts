/**
 * Floor outlines for the NFC floor view (docs/specs/2026-11-08-floor-map-design.md).
 * Our own simplified drawing, never the university's floor plan. Everything is
 * in 0..1 across the outline, the same space as tables.pos_x / pos_y.
 */
export interface Zone {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FloorLayout {
  /** Width / height of the outline; portrait so it fills a phone. */
  aspect: number;
  zones: Zone[];
  /** The vertical corridor, as an x range. */
  corridor: { x: number; w: number };
  /** Where the NFC tag is. */
  entrance: { x: number; y: number };
  /**
   * Fallback spots, in table order, for tables with no stored position yet
   * (e.g. before 140_floor_positions.sql reaches a database).
   */
  defaultSpots: { x: number; y: number }[];
}

export const FLOOR_LAYOUTS: Record<string, FloorLayout> = {
  // TFDL · 3rd floor
  'c0ffee00-0000-4000-8000-0000000000f3': {
    aspect: 0.78,
    zones: [
      { label: 'Open study', x: 0.04, y: 0.08, w: 0.4, h: 0.6 },
      { label: 'Stacks', x: 0.56, y: 0.08, w: 0.4, h: 0.72 },
      { label: 'Group rooms', x: 0.04, y: 0.72, w: 0.4, h: 0.2 },
    ],
    corridor: { x: 0.46, w: 0.08 },
    entrance: { x: 0.5, y: 0.95 },
    defaultSpots: [
      { x: 0.22, y: 0.16 },
      { x: 0.26, y: 0.5 },
      { x: 0.74, y: 0.62 },
    ],
  },
};

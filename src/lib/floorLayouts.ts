import { TFDL3_PLAN } from './floorPlans/tfdl3';

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

/** A traced floor plan (scripts/trace_floor.py): SVG paths in a w x h viewBox. */
export interface FloorPlan {
  w: number;
  h: number;
  outline: string;
  rooms: readonly string[];
  corridors: readonly string[];
  elevators: readonly string[];
  stairs: readonly string[];
  washrooms: readonly string[];
}

export interface FloorLayout {
  /** Real building geometry. When present it's drawn instead of the zone boxes. */
  plan?: FloorPlan;
  /** Area names drawn on the plan, at 0..1 positions. */
  labels?: { text: string; x: number; y: number }[];
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
  // TFDL · 3rd floor, traced from the university's floor 3 plan (north at top).
  'c0ffee00-0000-4000-8000-0000000000f3': {
    plan: TFDL3_PLAN,
    aspect: TFDL3_PLAN.w / TFDL3_PLAN.h,
    labels: [
      { text: 'North lounge', x: 0.62, y: 0.03 },
      { text: '354 Open study', x: 0.22, y: 0.255 },
      { text: '340 Open study', x: 0.22, y: 0.665 },
      { text: '330 Study', x: 0.18, y: 0.82 },
      { text: 'Group rooms', x: 0.8, y: 0.47 },
    ],
    zones: [],
    corridor: { x: 0, w: 0 },
    // South stairs and elevators, where the NFC tag is.
    entrance: { x: 0.6, y: 0.79 },
    defaultSpots: [],
  },
};

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
  // TFDL · 3rd floor. Traced from the floor 3 plan and drawn upright: north at
  // the top, the west windows on the left, the long corridor down the middle.
  'c0ffee00-0000-4000-8000-0000000000f3': {
    aspect: 0.56,
    zones: [
      { label: '350 · 351 North lounge', x: 0.04, y: 0.015, w: 0.92, h: 0.085 },
      { label: '352 Study', x: 0.04, y: 0.11, w: 0.38, h: 0.14 },
      { label: '354 Open study', x: 0.04, y: 0.265, w: 0.38, h: 0.32 },
      { label: '340 Open study', x: 0.04, y: 0.6, w: 0.38, h: 0.13 },
      { label: '330 Study rooms', x: 0.04, y: 0.745, w: 0.38, h: 0.2 },
      { label: '350s · 360s Rooms', x: 0.58, y: 0.11, w: 0.38, h: 0.1 },
      { label: '364 Study', x: 0.58, y: 0.22, w: 0.38, h: 0.12 },
      { label: '368 Group rooms', x: 0.58, y: 0.35, w: 0.38, h: 0.22 },
      { label: 'Stairs · elevators', x: 0.58, y: 0.585, w: 0.38, h: 0.085 },
      { label: '310 · 316 · 320', x: 0.58, y: 0.685, w: 0.38, h: 0.26 },
    ],
    corridor: { x: 0.44, w: 0.12 },
    // The south stairs and elevators, where the NFC tag is.
    entrance: { x: 0.5, y: 0.63 },
    defaultSpots: [
      { x: 0.12, y: 0.33 },
      { x: 0.3, y: 0.43 },
      { x: 0.14, y: 0.53 },
    ],
  },
};

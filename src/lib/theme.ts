/**
 * Design tokens for the places a className cannot reach: map marker tints,
 * QR code colours, the status bar, native tab bar options.
 *
 * These MUST stay in step with the @theme block in global.css. If you change a
 * colour, change it in both files.
 */
export const colors = {
  cream: '#FBF7F1',
  surface: '#FFFFFF',
  sunk: '#F4ECE2',
  border: '#E8DED2',

  espresso: '#2E2017',
  mocha: '#6B5445',

  clay: '#9C4A28',
  claySoft: '#F6E6DC',

  sage: '#2F6B4A',
  sageSoft: '#E4F0E8',

  amber: '#8A5A00',
  amberSoft: '#FBEFD6',

  brick: '#9B3326',
  brickSoft: '#F8E3E0',

  berry: '#7A3B6B',
  berrySoft: '#F3E6F0',
} as const;

/**
 * Minimum hit target. 44pt is the Apple HIG floor and Android's 48dp maps to
 * roughly the same; every pressable in this app should be at least this tall.
 */
export const MIN_TAP_TARGET = 48;

/**
 * Design tokens for the places a className cannot reach: map marker tints,
 * QR code colours, the status bar, native tab bar options.
 *
 * These MUST stay in step with the @theme block in global.css. If you change a
 * colour, change it in both files.
 */
export const colors = {
  cream: '#F6F6F3',
  surface: '#FFFFFF',
  sunk: '#EEEEEA',
  border: '#E4E4DF',

  espresso: '#131516',
  mocha: '#5A5F63',

  clay: '#1C5C64',
  claySoft: '#E6F2F3',

  sage: '#1F6B3D',
  sageSoft: '#E3F3E8',

  amber: '#7A5A12',
  amberSoft: '#FBF3DC',

  brick: '#AC2F28',
  brickSoft: '#FBE7E4',

  berry: '#1C5C64',
  berrySoft: '#E6F2F3',

  /* The box light itself (lamps, pins, picker symbols). Not for text. */
  go: '#2E9E5B',
  ask: '#E8B630',
  askInk: '#3A2A00',
  stop: '#D0433A',
  lampOff: '#2B2E30',
  pole: '#17191A',
} as const;

/**
 * Minimum hit target. 44pt is the Apple HIG floor and Android's 48dp maps to
 * roughly the same; every pressable in this app should be at least this tall.
 */
export const MIN_TAP_TARGET = 48;

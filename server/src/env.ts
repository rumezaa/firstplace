// All configuration comes from the environment (server/.env locally, the
// Vultr box in production). Nothing here is ever sent to the app.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy server/.env.example to server/.env.`);
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';

export const env = {
  port: Number(process.env.PORT ?? 8787),
  isProduction,
  databaseUrl: required('DATABASE_URL'),

  // Auth0. When unset, only the dev login works (fine for local work).
  auth0Domain: process.env.AUTH0_DOMAIN ?? '',
  auth0Audience: process.env.AUTH0_AUDIENCE ?? '',

  // Dev login: POST /dev/login issues a short-lived token for a seeded user, so
  // the demo never depends on Auth0. Off in production unless explicitly on.
  devLogin: process.env.DEV_LOGIN ? process.env.DEV_LOGIN === 'true' : !isProduction,
  devTokenSecret: process.env.DEV_TOKEN_SECRET ?? (isProduction ? '' : 'local-dev-only-secret'),

  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  geminiModels: (process.env.GEMINI_MODELS ?? 'gemini-3.5-flash,gemini-flash-latest')
    .split(',').map((m) => m.trim()).filter(Boolean),

  // Chat-table lights: comma-separated device keys. Each ESP32 sends one.
  hwDeviceKeys: (process.env.HW_DEVICE_KEYS ?? '').split(',').map((k) => k.trim()).filter(Boolean),

  // Google Places API (New). Unset = the map shows only what db/seed.sql put
  // in the database; nothing errors.
  placesApiKey: process.env.GOOGLE_PLACES_API_KEY ?? '',
  // Table A place types to import. See server/src/places.ts.
  placesIncludedTypes: (process.env.PLACES_INCLUDED_TYPES ??
    'cafe,coffee_shop,tea_house,bakery,library,book_store')
    .split(',').map((t) => t.trim()).filter(Boolean),
  // Atmosphere fields (editorialSummary, goodForGroups) are the most expensive
  // Places SKU. Off = those columns stay empty rather than being invented.
  placesAtmosphere: (process.env.PLACES_ATMOSPHERE ?? 'true') === 'true',
  // Downtown Calgary, matching CALGARY_REGION in src/lib/venues.ts.
  placesDefaultLat: Number(process.env.PLACES_DEFAULT_LAT ?? 51.0447),
  placesDefaultLng: Number(process.env.PLACES_DEFAULT_LNG ?? -114.0719),
  placesRadiusM: Number(process.env.PLACES_RADIUS_M ?? 5000),
  // How long one area of the map is considered up to date. Every miss is a
  // billed Google call, so this is the main cost dial.
  placesCacheMs: Number(process.env.PLACES_CACHE_MINUTES ?? 10) * 60_000,
  // Background refresh of the default area, so open-now and ratings keep up.
  // 0 turns the job off.
  placesSyncMinutes: Number(process.env.PLACES_SYNC_MINUTES ?? 15),

  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((o) => o.trim()),
};

if (env.devLogin && !env.devTokenSecret) {
  throw new Error('DEV_LOGIN is on but DEV_TOKEN_SECRET is empty.');
}

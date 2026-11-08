// All configuration comes from the environment (server/.env locally, the
// Vultr box in production). Nothing here is ever sent to the app.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy server/.env.example to server/.env.`);
  return value;
}

function num(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function withTrailingSlash(base: string): string {
  return base.endsWith('/') ? base : `${base}/`;
}

const isProduction = process.env.NODE_ENV === 'production';

export const env = {
  port: Number(process.env.PORT ?? 8787),
  isProduction,
  databaseUrl: required('DATABASE_URL'),

  // Auth0. When unset, only the dev login works (fine for local work).
  auth0Domain: process.env.AUTH0_DOMAIN ?? '',
  // Must equal the Auth0 API identifier; a stray trailing slash would reject every token.
  auth0Audience: (process.env.AUTH0_AUDIENCE ?? '').trim().replace(/\/+$/, ''),

  // Dev login: POST /dev/login issues a short-lived token for a seeded user, so
  // the demo never depends on Auth0. Off in production unless explicitly on.
  devLogin: process.env.DEV_LOGIN ? process.env.DEV_LOGIN === 'true' : !isProduction,
  devTokenSecret: process.env.DEV_TOKEN_SECRET ?? (isProduction ? '' : 'local-dev-only-secret'),

  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  geminiModels: (process.env.GEMINI_MODELS ?? 'gemini-3.5-flash,gemini-3.5-flash-lite')
    .split(',').map((m) => m.trim()).filter(Boolean),
  // Guard rails on every Gemini call (cache hits are free and never counted).
  gemini: {
    timeoutMs: num('GEMINI_TIMEOUT_MS', 8_000), // one model attempt
    deadlineMs: num('GEMINI_DEADLINE_MS', 15_000), // all fallback models together
    userPerMinute: num('GEMINI_USER_PER_MINUTE', 6),
    userPerDay: num('GEMINI_USER_PER_DAY', 60),
    globalPerMinute: num('GEMINI_GLOBAL_PER_MINUTE', 30), // stay under the project quota
    maxConcurrent: num('GEMINI_MAX_CONCURRENT', 4),
  },

  // Weather for the meetup planner. Open-Meteo needs no key, so this is only
  // here so a self-hosted mirror can be pointed at instead.
  weatherApiUrl: process.env.WEATHER_API_URL ?? 'https://api.open-meteo.com/v1/forecast',
  weatherTimeoutMs: Number(process.env.WEATHER_TIMEOUT_MS ?? 4000),
  // Must match public.local_tz() in db/migrations/010_init.sql.
  localTimezone: process.env.LOCAL_TIMEZONE ?? 'America/Edmonton',

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

  // Where NFC/QR tag links (/t/<tableId>, /v/<venueId>) forward to. The tags
  // hold a link to this server, so switching between a dev build
  // (firstplace://) and Expo Go (exp://<laptop-ip>:8081/--/) is a change here,
  // never a rewrite of the stickers.
  appLinkBase: withTrailingSlash(process.env.APP_LINK_BASE?.trim() || 'firstplace://'),
  // Optional: the deployed Expo web build. Set = the tag page also shows an
  // "Open on the web" link.
  webAppUrl: (process.env.WEB_APP_URL ?? '').trim().replace(/\/+$/, ''),

  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((o) => o.trim()),
};

if (env.devLogin && !env.devTokenSecret) {
  throw new Error('DEV_LOGIN is on but DEV_TOKEN_SECRET is empty.');
}

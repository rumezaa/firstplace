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

const isProduction =process.env.NODE_ENV === 'production';

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

  // Chat-table lights: comma-separated device keys. Each ESP32 sends one.
  hwDeviceKeys: (process.env.HW_DEVICE_KEYS ?? '').split(',').map((k) => k.trim()).filter(Boolean),

  corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(',').map((o) => o.trim()),
};

if (env.devLogin && !env.devTokenSecret) {
  throw new Error('DEV_LOGIN is on but DEV_TOKEN_SECRET is empty.');
}

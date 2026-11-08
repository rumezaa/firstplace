// ============================================================================
// Weather for planning: "is this window actually pleasant to be outside in?"
// ============================================================================
// Open-Meteo, because it needs no API key and no attribution header, so the
// feature works on a teammate's laptop the moment they clone the repo.
//
// Two decisions worth knowing:
//
//  * We score the *apparent* temperature, not the air temperature. Calgary is
//    the wrong city to ignore wind chill: a 12°C chinook afternoon with a
//    45 km/h wind feels like 3°C, and a plan that reads "12°C, go for a walk"
//    would be wrong in the way that makes people stop trusting the app.
//
//  * Days are bucketed into morning/afternoon/evening, matching
//    public.part_of_day. A week-out hourly forecast is not accurate enough to
//    justify finer granularity, and coarse windows keep this from turning into
//    a location-sharing feature.

export type PartOfDay = 'morning' | 'afternoon' | 'evening';

export const PARTS_OF_DAY: PartOfDay[] = ['morning', 'afternoon', 'evening'];

/** Local-time hour ranges, end exclusive. Evening stops at 21:00 — the boxes
 *  go dark at 22:00 and nobody is starting an activity after that. */
export const PART_HOURS: Record<PartOfDay, [number, number]> = {
  morning: [8, 12],
  afternoon: [12, 17],
  evening: [17, 21],
};

export interface WindowWeather {
  day: string;
  part: PartOfDay;
  /** Air temperature, mean over the window. */
  tempC: number;
  /** Apparent temperature (wind chill / humidex), mean and worst. */
  feelsLikeC: number;
  feelsLikeMinC: number;
  /** Highest chance of precipitation in the window, percent. */
  precipProb: number;
  /** Total liquid precipitation, mm. */
  precipMm: number;
  /** Total snow, cm. */
  snowCm: number;
  /** Strongest wind in the window, km/h. */
  windKph: number;
  /** Share of the window that is in daylight, 0..1. */
  daylight: number;
  /** WMO weather code, taken from the middle of the window. */
  code: number;
  /** 0..1 — how good this window is for being outdoors. */
  outdoorScore: number;
  /** One short human line: "−9°, feels like −16 in the wind". */
  headline: string;
}

export interface WeatherReport {
  latitude: number;
  longitude: number;
  timezone: string;
  windows: WindowWeather[];
  fetchedAt: string;
  source: 'open-meteo';
}

/** Calgary city centre — the fallback when a pair has no venue in common. */
export const CALGARY = { lat: 51.0447, lon: -114.0719 } as const;

/**
 * Config is passed in rather than read from `env` here so that everything in
 * this file is a pure function of its arguments: the scoring below is the part
 * most worth unit-testing, and it should not need a DATABASE_URL to import.
 * server/src/routes/meetups.ts passes the configured values.
 */
export interface FetchOptions {
  apiUrl?: string;
  timezone?: string;
  timeoutMs?: number;
  /** Log fetch failures. Off in production. */
  verbose?: boolean;
}

export const WEATHER_DEFAULTS = {
  apiUrl: 'https://api.open-meteo.com/v1/forecast',
  /** Must match public.local_tz() in db/migrations/010_init.sql. */
  timezone: 'America/Edmonton',
  timeoutMs: 4000,
} as const;

const HOURLY = [
  'temperature_2m',
  'apparent_temperature',
  'precipitation_probability',
  'precipitation',
  'snowfall',
  'wind_speed_10m',
  'is_day',
  'weather_code',
].join(',');

interface HourlyPayload {
  timezone?: string;
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    apparent_temperature?: (number | null)[];
    precipitation_probability?: (number | null)[];
    precipitation?: (number | null)[];
    snowfall?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    is_day?: (number | null)[];
    weather_code?: (number | null)[];
  };
}

// The forecast is the same for everyone in the city and changes hourly at best,
// so one cache entry serves every phone.
const cache = new Map<string, { at: number; report: WeatherReport }>();
const CACHE_MS = 30 * 60_000;

/**
 * Per-part forecast for the next `days` days, or null if Open-Meteo cannot be
 * reached. Never throws: a weather outage must degrade the plan to indoor
 * suggestions, not break the screen. (Same contract as gemini.generate.)
 */
export async function fetchWeather(
  lat: number = CALGARY.lat,
  lon: number = CALGARY.lon,
  days: number = 8,
  opts: FetchOptions = {},
): Promise<WeatherReport | null> {
  const apiUrl = opts.apiUrl ?? WEATHER_DEFAULTS.apiUrl;
  const timezone = opts.timezone ?? WEATHER_DEFAULTS.timezone;
  const span = Math.min(Math.max(Math.round(days), 1), 16);
  const key = `${apiUrl}|${lat.toFixed(2)},${lon.toFixed(2)},${span}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.report;

  const url =
    `${apiUrl}?latitude=${lat}&longitude=${lon}` +
    `&timezone=${encodeURIComponent(timezone)}&forecast_days=${span}&hourly=${HOURLY}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(opts.timeoutMs ?? WEATHER_DEFAULTS.timeoutMs),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const report = toReport(lat, lon, (await res.json()) as HourlyPayload, timezone);
    if (!report.windows.length) throw new Error('no hourly data');
    cache.set(key, { at: Date.now(), report });
    return report;
  } catch (err) {
    if (opts.verbose) console.warn('[weather] fetch failed:', (err as Error).message.slice(0, 120));
    return null;
  }
}

/** Exported for tests: fold an Open-Meteo hourly payload into windows. */
export function toReport(
  lat: number,
  lon: number,
  payload: HourlyPayload,
  fallbackTimezone: string = WEATHER_DEFAULTS.timezone,
): WeatherReport {
  const h = payload.hourly ?? {};
  const times = h.time ?? [];

  // Bucket hour indices by "<day>|<part>".
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < times.length; i += 1) {
    const stamp = times[i];
    if (!stamp) continue;
    const [day, clock] = stamp.split('T');
    const hour = Number(clock?.slice(0, 2));
    if (!day || Number.isNaN(hour)) continue;
    const part = PARTS_OF_DAY.find((p) => hour >= PART_HOURS[p][0] && hour < PART_HOURS[p][1]);
    if (!part) continue;
    const key = `${day}|${part}`;
    const list = buckets.get(key);
    if (list) list.push(i);
    else buckets.set(key, [i]);
  }

  const num = (arr: (number | null)[] | undefined, i: number): number => {
    const v = arr?.[i];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  };

  const windows: WindowWeather[] = [];
  for (const [key, idx] of buckets) {
    const [day, part] = key.split('|') as [string, PartOfDay];
    const n = idx.length;
    if (!n) continue;

    const temps = idx.map((i) => num(h.temperature_2m, i));
    const feels = idx.map((i) => num(h.apparent_temperature, i));
    const tempC = round1(temps.reduce(sum, 0) / n);
    const feelsLikeC = round1(feels.reduce(sum, 0) / n);
    const feelsLikeMinC = round1(Math.min(...feels));
    const precipProb = Math.max(...idx.map((i) => num(h.precipitation_probability, i)));
    const precipMm = round1(idx.map((i) => num(h.precipitation, i)).reduce(sum, 0));
    const snowCm = round1(idx.map((i) => num(h.snowfall, i)).reduce(sum, 0));
    const windKph = round1(Math.max(...idx.map((i) => num(h.wind_speed_10m, i))));
    const daylight = idx.filter((i) => num(h.is_day, i) === 1).length / n;
    const code = num(h.weather_code, idx[Math.floor(n / 2)] ?? idx[0] ?? 0);

    const base = {
      day, part, tempC, feelsLikeC, feelsLikeMinC,
      precipProb, precipMm, snowCm, windKph, daylight, code,
    };
    windows.push({
      ...base,
      outdoorScore: outdoorScore(base),
      headline: headline(base),
    });
  }

  windows.sort((a, b) => (a.day === b.day
    ? PARTS_OF_DAY.indexOf(a.part) - PARTS_OF_DAY.indexOf(b.part)
    : a.day.localeCompare(b.day)));

  return {
    latitude: lat,
    longitude: lon,
    timezone: payload.timezone ?? fallbackTimezone,
    windows,
    fetchedAt: new Date().toISOString(),
    source: 'open-meteo',
  };
}

const sum = (a: number, b: number): number => a + b;
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Piecewise-linear lookup. `points` is [input, score] pairs, ascending. */
export function interpolate(value: number, points: [number, number][]): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return 0;
  if (value <= first[0]) return first[1];
  if (value >= last[0]) return last[1];
  for (let i = 1; i < points.length; i += 1) {
    const lo = points[i - 1]!;
    const hi = points[i]!;
    if (value <= hi[0]) {
      const span = hi[0] - lo[0];
      const t = span === 0 ? 0 : (value - lo[0]) / span;
      return lo[1] + t * (hi[1] - lo[1]);
    }
  }
  return last[1];
}

type Conditions = Pick<
  WindowWeather,
  'part' | 'tempC' | 'feelsLikeC' | 'feelsLikeMinC' | 'precipProb' | 'precipMm' | 'snowCm' | 'windKph' | 'daylight'
>;

/**
 * How good a window is for an outdoor plan, 0..1.
 *
 * Temperature is a GATE, not one vote of three. An earlier version averaged
 * comfort, rain and wind together, which scored a −28 °C afternoon at 0.34
 * because it happened to be dry and calm — the kind of answer that gets
 * somebody standing outside in a parka wondering why they trusted the app. A
 * still, clear −28 is not 34% of a nice day, so comfort multiplies instead.
 *
 * Rain and wind are then blended as `0.5 * worse + 0.5 * mean`, so a soaking
 * is not cancelled out by the lack of wind, but one mediocre factor does not
 * zero out an otherwise fine afternoon.
 */
export function outdoorScore(c: Conditions): number {
  // Apparent temperature. Below about −18 feels-like, Calgary outdoors is a
  // dare rather than a plan.
  const comfort = interpolate(c.feelsLikeC, [
    [-30, 0], [-18, 0.05], [-10, 0.2], [-2, 0.45], [6, 0.7], [14, 1], [24, 1], [30, 0.55], [36, 0.15],
  ]);
  const dry = interpolate(c.precipProb, [[0, 1], [20, 0.95], [40, 0.7], [60, 0.4], [80, 0.2], [100, 0.05]]);
  const calm = interpolate(c.windKph, [[0, 1], [20, 0.95], [35, 0.7], [50, 0.4], [70, 0.15]]);

  const sky = [dry, calm];
  const worst = Math.min(...sky);
  const mean = sky.reduce(sum, 0) / sky.length;
  let score = comfort * (0.5 * worst + 0.5 * mean);

  // Standing around in the dark is not an outdoor activity.
  if (c.daylight < 0.5) score *= 0.45 + 0.55 * c.daylight;
  // Fresh snow is charming for a walk and ruinous for anything else; this is
  // the walk-friendly reading, so only a dump is penalised.
  if (c.snowCm > 2) score *= 0.6;

  return Math.round(Math.max(0, Math.min(1, score)) * 100) / 100;
}

/** A short line a person can sanity-check the plan against. */
export function headline(c: Conditions): string {
  const t = `${Math.round(c.tempC)}°C`;
  const bits: string[] = [];

  // Only mention feels-like when it actually differs enough to matter.
  if (Math.abs(c.feelsLikeC - c.tempC) >= 3) bits.push(`feels like ${Math.round(c.feelsLikeC)}°`);
  if (c.snowCm >= 0.5) bits.push(`${c.snowCm} cm of snow`);
  else if (c.precipProb >= 40) bits.push(`${Math.round(c.precipProb)}% chance of rain`);
  if (c.windKph >= 35) bits.push('windy');
  if (c.daylight < 0.5 && c.part === 'evening') bits.push('dark by then');

  return bits.length ? `${t}, ${bits.join(', ')}` : t;
}

/** Look one window up. */
export function windowFor(
  report: WeatherReport | null,
  day: string,
  part: PartOfDay,
): WindowWeather | null {
  return report?.windows.find((w) => w.day === day && w.part === part) ?? null;
}

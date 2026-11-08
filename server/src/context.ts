// "Right now in Calgary": local time and date, statutory holidays and the
// weather. Free public sources, no keys, cached so a busy afternoon costs a
// handful of outside calls:
//   weather   Environment and Climate Change Canada, Calgary city page (ab-52)
//             Open Government Licence – Canada
//   holidays  Nager.Date public holiday API

export const TZ = 'America/Edmonton';
const FETCH_TIMEOUT_MS = 8_000;
const WEATHER_TTL_MS = 15 * 60_000;
const ECCC_URL = 'https://api.weather.gc.ca/collections/citypageweather-realtime/items/ab-52?f=json&lang=en';

// ------------------------------------------------------------------- time ---
export type LocalParts = { date: string; weekday: string; minutes: number; hhmm: string };

/** Calgary-local date (YYYY-MM-DD), weekday, and minutes since midnight. */
export function localParts(d: Date): LocalParts {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: String(parts.weekday).toLowerCase(),
    minutes,
    hhmm: `${parts.hour}:${parts.minute}`,
  };
}

/** "2:30 pm" in Calgary time. */
export function localClock(d: Date): string {
  return d.toLocaleTimeString('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
}

// --------------------------------------------------------------- holidays ---
const holidayCache = new Map<number, Promise<{ date: string; name: string }[]>>();

async function holidaysFor(year: number): Promise<{ date: string; name: string }[]> {
  let p = holidayCache.get(year);
  if (!p) {
    p = fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/CA`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((list: { date: string; localName: string; counties: string[] | null }[]) =>
        list.filter((h) => !h.counties || h.counties.includes('CA-AB')).map((h) => ({ date: h.date, name: h.localName })))
      .catch((e) => {
        holidayCache.delete(year); // try again next time
        console.warn('[context] holidays failed:', (e as Error).message);
        return [];
      });
    holidayCache.set(year, p);
  }
  return p;
}

// ---------------------------------------------------------------- weather ---
export type HourForecast = { at: string; condition: string; tempC: number; precipChancePct: number };

export type Weather = {
  condition: string;
  tempC: number | null;
  feelsLikeC: number | null;
  windKmh: number | null;
  gustKmh: number | null;
  warnings: string[];
  sunrise: string | null;
  sunset: string | null;
  hourly: HourForecast[];
  today: string | null;
  observedAt: string | null;
  source: string;
};

let weatherCache: { at: number; value: Weather } | null = null;
let weatherInFlight: Promise<Weather | null> | null = null;

type Lang<T> = { en: T } | undefined;
const en = <T>(v: Lang<T>): T | null => (v && v.en !== undefined ? v.en : null);

async function fetchWeather(): Promise<Weather> {
  const res = await fetch(ECCC_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const p = ((await res.json()) as { properties: any }).properties;
  const cur = p.currentConditions ?? {};
  const now = Date.now();
  return {
    condition: en<string>(cur.condition) ?? 'Unknown',
    tempC: en<number>(cur.temperature?.value),
    feelsLikeC: en<number>(cur.windChill?.value) ?? en<number>(cur.humidex?.value) ?? en<number>(cur.temperature?.value),
    windKmh: en<number>(cur.wind?.speed?.value),
    gustKmh: en<number>(cur.wind?.gust?.value),
    warnings: (Array.isArray(p.warnings) ? p.warnings : [])
      .filter((w: any) => !en(w.expiryTime) || Date.parse(en<string>(w.expiryTime)!) > now)
      .map((w: any) => en<string>(w.description))
      .filter(Boolean),
    sunrise: en<string>(p.riseSet?.sunrise),
    sunset: en<string>(p.riseSet?.sunset),
    hourly: (p.hourlyForecastGroup?.hourlyForecasts ?? []).map((h: any) => ({
      at: h.timestamp,
      condition: en<string>(h.condition) ?? '',
      tempC: en<number>(h.temperature?.value) ?? NaN,
      precipChancePct: en<number>(h.lop?.value) ?? 0,
    })),
    today: en<string>(p.forecastGroup?.forecasts?.[0]?.textSummary),
    observedAt: en<string>(cur.timestamp),
    source: 'Environment and Climate Change Canada',
  };
}

/** Current Calgary weather, cached 15 minutes. Null if ECCC is unreachable. */
export async function getWeather(): Promise<Weather | null> {
  if (weatherCache && Date.now() - weatherCache.at < WEATHER_TTL_MS) return weatherCache.value;
  weatherInFlight ??= fetchWeather()
    .then((value) => {
      weatherCache = { at: Date.now(), value };
      return value;
    })
    .catch((e) => {
      console.warn('[context] weather failed:', (e as Error).message);
      return weatherCache?.value ?? null; // stale beats nothing
    })
    .finally(() => {
      weatherInFlight = null;
    });
  return weatherInFlight;
}

// ---------------------------------------------------------------- outside ---
export type OutdoorCall = { ok: boolean; reason: string | null };

/**
 * Is it reasonable to plan time outside between `from` and `to`? Conservative
 * on purpose: two people who just met shouldn't be stuck in a windstorm.
 */
export function outdoorCall(w: Weather | null, from: Date, to: Date): OutdoorCall {
  if (!w) return { ok: true, reason: null };
  if (w.warnings.length) return { ok: false, reason: `${w.warnings[0].toLowerCase()} in effect` };
  if (w.feelsLikeC !== null && w.feelsLikeC <= -15) return { ok: false, reason: `it feels like ${w.feelsLikeC}°C` };
  if (w.gustKmh !== null && w.gustKmh >= 60) return { ok: false, reason: `gusts up to ${w.gustKmh} km/h` };
  const wet = w.hourly.find((h) => {
    const t = Date.parse(h.at);
    return t >= from.getTime() - 60 * 60_000 && t <= to.getTime() && h.precipChancePct >= 60;
  });
  if (wet) return { ok: false, reason: `${wet.condition.toLowerCase() || 'rain or snow'} likely` };
  return { ok: true, reason: null };
}

export type CalgaryNow = {
  now: string;
  local: LocalParts & { clock: string };
  holiday: string | null;
  weather: Weather | null;
};

export async function calgaryNow(at = new Date()): Promise<CalgaryNow> {
  const local = localParts(at);
  const [weather, holidays] = await Promise.all([getWeather(), holidaysFor(Number(local.date.slice(0, 4)))]);
  return {
    now: at.toISOString(),
    local: { ...local, clock: localClock(at) },
    holiday: holidays.find((h) => h.date === local.date)?.name ?? null,
    weather,
  };
}

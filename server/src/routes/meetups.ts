import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth, type AuthVars } from '../auth.js';
import { asUser } from '../db.js';
import { env } from '../env.js';
import { generate } from '../gemini.js';
import { buildPlan, type MeetupPlan, type SharedProfile, type Venue, type Window } from '../planner.js';
import { CALGARY, fetchWeather, type FetchOptions, type WeatherReport } from '../weather.js';

// Planning the second meeting. The rules live in db/migrations/100_meetups.sql
// — in particular, that each person only ever sees the INTERSECTION of the two
// calendars, and only after both have submitted. This file does the two things
// SQL should not: call the forecast, and rank ideas (server/src/planner.ts).
export const meetups = new Hono<{ Variables: AuthVars }>();
meetups.use('*', requireAuth);

const PARTS = ['morning', 'afternoon', 'evening'] as const;

/** Weather config from the environment, passed into the pure weather module. */
const WEATHER: FetchOptions = {
  apiUrl: env.weatherApiUrl,
  timezone: env.localTimezone,
  timeoutMs: env.weatherTimeoutMs,
  verbose: !env.isProduction,
};

async function body<T>(c: { req: { json: () => Promise<unknown> } }): Promise<T> {
  return ((await c.req.json().catch(() => ({}))) ?? {}) as T;
}

async function rpc<T = unknown>(userId: string | null, sql: string, params: unknown[] = []): Promise<T> {
  const r = await asUser(userId, (db) => db.query(`select ${sql} as result`, params));
  return r.rows[0]?.result as T;
}

/** Today in Calgary, not on whatever zone the box happens to run in. */
function localToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: env.localTimezone });
}

interface MeetupInputs {
  meetup_id: string;
  status: string;
  shared: SharedProfile;
  their_first_name: string | null;
  met_at: Venue | null;
  overlap: { ready: boolean; waiting_on: string | null; mine: number; windows: Window[] };
  horizon_days: number;
}

// ------------------------------------------------------------------ opening --
/** Start (or resume) planning with someone you connected with. */
meetups.post('/connections/:id/meetup', async (c) =>
  c.json(await rpc(c.get('userId'), 'public.open_meetup($1)', [c.req.param('id')])),
);

meetups.get('/me/meetups', async (c) => {
  const rows = await asUser(c.get('userId'), (db) => db.query('select * from public.my_meetups()'));
  return c.json(rows.rows);
});

// ------------------------------------------------------------------ picking --
/**
 * The planning screen: who it is with, what you two share, where you are in the
 * handshake — and the forecast, so people pick times knowing Thursday is the
 * one that is +9 °C rather than finding out after they have agreed.
 */
meetups.get('/meetups/:id', async (c) => {
  const inputs = await rpc<MeetupInputs>(c.get('userId'), 'public.meetup_inputs($1)', [c.req.param('id')]);
  if (!inputs) throw new HTTPException(404, { message: 'No such plan.' });

  const where = inputs.met_at ?? { lat: CALGARY.lat, lng: CALGARY.lon };
  const weather = await fetchWeather(where.lat, where.lng, Math.min(inputs.horizon_days, 16), WEATHER);

  return c.json({
    ...inputs,
    today: localToday(),
    forecast: weather?.windows ?? [],
    forecast_available: Boolean(weather),
  });
});

meetups.post('/meetups/:id/availability', async (c) => {
  const b = await body<{ slots?: { day?: string; part?: string }[] }>(c);
  if (!Array.isArray(b.slots) || b.slots.length === 0) {
    throw new HTTPException(400, { message: 'Pick at least one time that works for you.' });
  }
  // Validate shape here so a typo comes back as a clear 400 rather than a
  // Postgres cast error. The horizon itself is enforced in SQL.
  const slots = b.slots.map((s) => {
    if (typeof s?.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.day)) {
      throw new HTTPException(400, { message: 'Each time needs a day like 2026-11-12.' });
    }
    if (!PARTS.includes(s.part as never)) {
      throw new HTTPException(400, { message: 'Each time needs morning, afternoon or evening.' });
    }
    return { day: s.day, part: s.part };
  });

  return c.json(
    await rpc(c.get('userId'), 'public.set_my_availability($1, $2::jsonb)', [
      c.req.param('id'),
      JSON.stringify(slots),
    ]),
  );
});

/** Just the overlap, for polling while waiting on the other person. */
meetups.get('/meetups/:id/overlap', async (c) =>
  c.json(await rpc(c.get('userId'), 'public.meetup_overlap($1)', [c.req.param('id')])),
);

// ----------------------------------------------------------------- planning --
/**
 * Build the itinerary and put it to both people.
 *
 * Order matters: SQL decides whether there is an overlap to plan in at all, the
 * forecast and the ranking happen here, and SQL stores the result and resets
 * both answers. Gemini only writes the invitation line at the end, so a Gemini
 * outage costs a sentence rather than the feature.
 */
meetups.post('/meetups/:id/plan', async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');

  const inputs = await rpc<MeetupInputs>(userId, 'public.meetup_inputs($1)', [id]);
  if (!inputs) throw new HTTPException(404, { message: 'No such plan.' });
  if (!inputs.overlap.ready) {
    throw new HTTPException(409, {
      message: inputs.overlap.waiting_on === 'you'
        ? 'Pick the times that work for you first.'
        : inputs.overlap.waiting_on === 'them'
          ? 'Waiting for them to pick their times.'
          : 'None of your times line up yet. Try adding a few more.',
    });
  }

  const where = inputs.met_at ?? { lat: CALGARY.lat, lng: CALGARY.lon };
  const [weather, venues] = await Promise.all([
    fetchWeather(where.lat, where.lng, Math.min(inputs.horizon_days, 16), WEATHER),
    asUser(userId, (db) =>
      db.query<Venue>(
        `select id, name, lat, lng, type, address, is_quiet, good_for_groups from public.venues`,
      ),
    ).then((r) => r.rows),
  ]);

  const plan = buildPlan({
    windows: inputs.overlap.windows,
    shared: inputs.shared,
    weather,
    venues,
    metAt: inputs.met_at,
    today: localToday(),
  });
  if (!plan) throw new HTTPException(409, { message: 'Could not find anything for those times.' });

  plan.invitation = await invitationLine(id, plan, inputs.shared);

  await rpc(userId, 'public.record_meetup_plan($1, $2::jsonb)', [id, JSON.stringify(plan)]);
  return c.json({ status: 'proposed', plan });
});

/**
 * One warm line to open with. Grounded entirely in the plan we already built —
 * the model is not asked to choose the activity, the day or the venue, so it
 * cannot invent a cafe or promise sunshine. Names are never sent.
 */
async function invitationLine(
  meetupId: string,
  plan: MeetupPlan,
  shared: SharedProfile,
): Promise<string | null> {
  const words = [...new Set([...(shared.interests ?? []), ...(shared.topics ?? [])])].slice(0, 5);
  const place = plan.venue?.name ?? plan.area ?? 'the usual place';

  return generate(
    `meetup-invite:${meetupId}:${plan.idea.id}:${plan.day}:${plan.part}`,
    'Two people met once at a Calgary cafe conversation table and both said it went well. ' +
      'They are arranging a second, friendly meet-up. Write the short message one could send the ' +
      `other to suggest it. The plan is already decided, do not change it: ${plan.idea.title} ` +
      `(${plan.idea.blurb}) at ${place}, ${plan.when}. Forecast: ${plan.weather?.headline ?? 'unknown'}. ` +
      `${words.length ? `Things they both like: ${words.join(', ')}. ` : ''}` +
      'Two sentences maximum, warm and low-pressure, easy to say no to, friendship not romance. ' +
      'Do not use any names or greetings with a name.',
    6 * 60 * 60_000,
  );
}

// ----------------------------------------------------------------- deciding --
meetups.post('/meetups/:id/respond', async (c) => {
  const { accept } = await body<{ accept?: boolean }>(c);
  if (typeof accept !== 'boolean') throw new HTTPException(400, { message: 'accept must be true or false.' });
  return c.json(await rpc(c.get('userId'), 'public.respond_to_meetup($1, $2)', [c.req.param('id'), accept]));
});

meetups.post('/meetups/:id/cancel', async (c) =>
  c.json(await rpc(c.get('userId'), 'public.cancel_meetup($1)', [c.req.param('id')])),
);

// ----------------------------------------------------------------- forecast --
/** The raw part-of-day forecast. Handy for the picker and for debugging. */
meetups.get('/forecast', async (c) => {
  const days = Math.min(Math.max(Number(c.req.query('days') ?? 8) || 8, 1), 16);
  const weather: WeatherReport | null = await fetchWeather(CALGARY.lat, CALGARY.lon, days, WEATHER);
  if (!weather) throw new HTTPException(503, { message: 'The forecast is unavailable right now.' });
  return c.json(weather);
});

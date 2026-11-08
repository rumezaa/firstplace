import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { issueDevToken, optionalAuth, type AuthVars } from './auth.js';
import { asSystem, asUser, pool } from './db.js';
import { env } from './env.js';
import { calgaryStatus, startCalgaryData } from './calgary.js';
import { startJobs } from './jobs.js';
import { serveTag } from './tagLinks.js';
import { actions } from './routes/actions.js';
import { conversations } from './routes/conversations.js';
import { hw } from './routes/hw.js';
import { me } from './routes/me.js';
import { meetups } from './routes/meetups.js';
import { plans } from './routes/plans.js';
import { venues } from './routes/venues.js';

const app = new Hono<{ Variables: AuthVars }>();

app.use('*', logger());
app.use('*', cors({ origin: env.corsOrigins.includes('*') ? '*' : env.corsOrigins }));

app.get('/health', async (c) => {
  const db = await pool.query('select 1').then(() => 'ok').catch(() => 'down');
  return c.json({ ok: db === 'ok', db, auth0: Boolean(env.auth0Domain), gemini: Boolean(env.geminiApiKey), calgary: calgaryStatus() });
});

// NFC stickers and printed QR codes: tiny HTML pages that hand off to the app
// (see src/tagLinks.ts). No login, no database.
app.get('/t/:id', serveTag('table'));
app.get('/v/:id', serveTag('floor'));

// The hardware light authenticates with its own device key, not a user login.
app.route('/hw', hw);

// Everything else reads the user's token if there is one.
app.use('*', optionalAuth);

if (env.devLogin) {
  // Demo safety net: sign in as a seeded user without Auth0.
  app.post('/dev/login', async (c) => {
    const { email } = (await c.req.json().catch(() => ({}))) as { email?: string };
    const sub = `seed|${email ?? 'demo@thirdplace.test'}`;
    const found = await asSystem((db) => db.query('select id from public.users where auth0_sub = $1', [sub]));
    if (!found.rows[0]) throw new HTTPException(404, { message: 'No seeded user with that email.' });
    return c.json({ token: await issueDevToken(sub) });
  });
}

app.route('/venues', venues);
// Before the routers below: their '*' requireAuth would otherwise cover /calgary/places.
app.route('/', plans);

/**
 * What a phone sees after tapping a box: the table, its venue and its light.
 * Works signed out. Never says who is sitting there; `mine` is only ever
 * about the caller's own claim.
 */
app.get('/tables/:tableId/view', async (c) => {
  const id = c.req.param('tableId');
  const view = await asUser(c.get('userId'), async (db) => {
    const t = (await db.query(
      `select t.id, t.label, t.seats, t.is_chat_table, t.box_enabled, v.id as venue_id, v.name as venue_name
       from public.tables t join public.venues v on v.id = t.venue_id where t.id = $1`, [id])).rows[0];
    if (!t) return null;
    const light = (await db.query('select public.table_light($1) as l', [id])).rows[0].l as string;
    const mine = c.get('userId')
      ? (await db.query(
          `select light, away_until from public.checkins where table_id = $1 and checked_out_at is null`, [id])).rows[0] ?? null
      : null;
    // Boxes go dark overnight (10pm to 6am). Say so up front, so the app
    // doesn't offer a claim that the database will refuse.
    const open = (await db.query('select public.boxes_open_now() as o')).rows[0].o as boolean;
    return { table: t, light, mine, boxes_open: open };
  });
  if (!view) throw new HTTPException(404, { message: "That table isn't a conversation zone." });
  return c.json(view);
});
app.route('/me', me);
app.route('/', conversations);
app.route('/', actions);
app.route('/', meetups);

app.notFound((c) => c.json({ error: 'Not found.' }, 404));

// Errors the app can show as-is. SQL functions raise user-facing messages
// (SQLSTATE P0001) with a stable `hint` token, e.g. kiosk_code_invalid.
app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  const pgErr = err as { code?: string; message?: string; hint?: string };
  if (pgErr.code === 'P0001') return c.json({ error: pgErr.message, hint: pgErr.hint ?? null }, 400);
  if (pgErr.code === '22P02') return c.json({ error: 'Invalid id.' }, 400);
  console.error(err);
  return c.json({ error: 'Something went wrong on our side.' }, 500);
});

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`ChatterBox API on http://localhost:${info.port}`);
  startJobs();
  void startCalgaryData();
});

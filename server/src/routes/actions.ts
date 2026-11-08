import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth, type AuthVars } from '../auth.js';
import { asUser } from '../db.js';
import { generate } from '../gemini.js';

// Write actions and staff screens. All of them go through the SQL functions in
// db/migrations/040_rpc.sql, which hold the real rules (kiosk code expiry,
// table belongs to venue, one open session per person, own side only).
export const actions = new Hono<{ Variables: AuthVars }>();
actions.use('*', requireAuth);

async function body<T>(c: { req: { json: () => Promise<unknown> } }): Promise<T> {
  return ((await c.req.json().catch(() => ({}))) ?? {}) as T;
}

// ---------------------------------------------------------------- check-in --
actions.post('/checkins', async (c) => {
  const b = await body<{ code?: string; tableId?: string; openToChat?: boolean }>(c);
  if (!b.code || !b.tableId) throw new HTTPException(400, { message: 'Scan the kiosk code and pick a table.' });
  const row = await asUser(c.get('userId'), (db) =>
    db.query('select public.check_in($1, $2, $3) as result', [b.code, b.tableId, Boolean(b.openToChat)]),
  );
  return c.json(row.rows[0].result);
});

actions.post('/checkins/checkout', async (c) => {
  const row = await asUser(c.get('userId'), (db) => db.query('select public.check_out() as result'));
  return c.json(row.rows[0].result);
});

actions.patch('/checkins/:id', async (c) => {
  const b = await body<{ openToChat?: boolean }>(c);
  if (typeof b.openToChat !== 'boolean') throw new HTTPException(400, { message: 'openToChat must be true or false.' });
  const row = await asUser(c.get('userId'), (db) =>
    db.query('update public.checkins set open_to_chat = $1 where id = $2 returning *', [b.openToChat, c.req.param('id')]),
  );
  if (!row.rows[0]) throw new HTTPException(404, { message: 'No such check-in.' });
  return c.json(row.rows[0]);
});

// ----------------------------------------------------------- familiar faces --
actions.post('/familiar-faces/:id/respond', async (c) => {
  const b = await body<{ accept?: boolean }>(c);
  const row = await asUser(c.get('userId'), (db) =>
    db.query('select public.respond_to_familiar_face($1, $2) as result', [c.req.param('id'), Boolean(b.accept)]),
  );
  return c.json(row.rows[0].result);
});

// -------------------------------------------------------------- staff tools --
// TODO(auth): restrict to venue staff (Auth0 role or a venue_staff table).
actions.patch('/tables/:id', async (c) => {
  const b = await body<{ status?: string }>(c);
  if (b.status !== 'open' && b.status !== 'taken') throw new HTTPException(400, { message: 'status must be open or taken.' });
  const row = await asUser(c.get('userId'), (db) =>
    db.query('update public.tables set status = $1 where id = $2 returning *', [b.status, c.req.param('id')]),
  );
  if (!row.rows[0]) throw new HTTPException(404, { message: 'No such table.' });
  return c.json(row.rows[0]);
});

actions.post('/kiosk/:venueId/code', async (c) => {
  const b = await body<{ ttlSeconds?: number }>(c);
  const row = await asUser(c.get('userId'), (db) =>
    db.query('select public.rotate_kiosk_code($1, $2) as result', [c.req.param('venueId'), b.ttlSeconds ?? 45]),
  );
  return c.json(row.rows[0].result);
});

actions.get('/dashboard/:venueId', async (c) => {
  const days = Math.min(Math.max(Number(c.req.query('days') ?? 30) || 30, 1), 365);
  const row = await asUser(c.get('userId'), (db) =>
    db.query('select public.venue_dashboard($1, $2) as result', [c.req.param('venueId'), days]),
  );
  return c.json(row.rows[0].result);
});

/** Gemini tip for the owner, from the same aggregates the dashboard shows. */
actions.get('/dashboard/:venueId/insight', async (c) => {
  const venueId = c.req.param('venueId');
  const dash = (
    await asUser(c.get('userId'), (db) => db.query('select public.venue_dashboard($1, 30) as result', [venueId]))
  ).rows[0].result as { suppressed: boolean };
  if (dash.suppressed) return c.json({ insight: null, suppressed: true });

  const text = await generate(
    `insight:${venueId}:${new Date().toISOString().slice(0, 13)}`,
    `You advise a Calgary cafe owner. From these anonymous 30-day stats, give ONE practical, specific ` +
      `idea (max 2 sentences) to fill quiet hours or grow repeat visits. Stats (JSON): ${JSON.stringify(dash)}`,
    60 * 60_000,
  );
  return c.json({ insight: text, suppressed: false, generated: Boolean(text) });
});

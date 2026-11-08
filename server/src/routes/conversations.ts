import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth, type AuthVars } from '../auth.js';
import { asSystem, asUser } from '../db.js';
import { icebreakers } from '../rag.js';

// The PRD's core loop: claim a table → set a light → someone joins (green) or
// requests (yellow) → talk with shared topics → private vote → connection.
// All rules live in SQL (db/migrations/080_conversations.sql); this file only
// passes requests through as the signed-in user.
export const conversations = new Hono<{ Variables: AuthVars }>();
conversations.use('*', requireAuth);

const LIGHTS = ['green', 'yellow', 'red'] as const;

async function body<T>(c: { req: { json: () => Promise<unknown> } }): Promise<T> {
  return ((await c.req.json().catch(() => ({}))) ?? {}) as T;
}

async function rpc<T = unknown>(userId: string | null, sql: string, params: unknown[] = []): Promise<T> {
  const r = await asUser(userId, (db) => db.query(`select ${sql} as result`, params));
  return r.rows[0]?.result as T;
}

// ---------------------------------------------------------------- the table --
conversations.post('/tables/:tableId/claim', async (c) => {
  const { light = 'yellow' } = await body<{ light?: string }>(c);
  if (!LIGHTS.includes(light as never)) throw new HTTPException(400, { message: 'light must be green, yellow or red.' });
  return c.json(await rpc(c.get('userId'), 'public.claim_table($1, $2::public.light_color)', [c.req.param('tableId'), light]));
});

conversations.post('/me/light', async (c) => {
  const { light } = await body<{ light?: string }>(c);
  if (!LIGHTS.includes(light as never)) throw new HTTPException(400, { message: 'light must be green, yellow or red.' });
  return c.json(await rpc(c.get('userId'), 'public.set_light($1::public.light_color)', [light]));
});

conversations.post('/me/step-away', async (c) => c.json(await rpc(c.get('userId'), 'public.step_away()')));

/** Help → Leave now: check out, light off, end any conversation. */
conversations.post('/me/leave-now', async (c) => c.json(await rpc(c.get('userId'), 'public.leave_now()')));

// ---------------------------------------------------------- joining a table --
conversations.post('/tables/:tableId/join', async (c) =>
  c.json(await rpc(c.get('userId'), 'public.join_green($1)', [c.req.param('tableId')])),
);

conversations.post('/tables/:tableId/request', async (c) =>
  c.json(await rpc(c.get('userId'), 'public.request_chat($1)', [c.req.param('tableId')])),
);

/** Requester polls this: pending | accepted (+conversation_id) | not_available. */
conversations.get('/requests/:id', async (c) =>
  c.json(await rpc(c.get('userId'), 'public.my_request_status($1)', [c.req.param('id')])),
);

/** Asker withdraws a pending request. Silent to the other person. */
conversations.post('/requests/:id/cancel', async (c) =>
  c.json(await rpc(c.get('userId'), 'public.cancel_request($1)', [c.req.param('id')])),
);

/** Seated person: request cards waiting for an answer. */
conversations.get('/me/requests', async (c) => {
  const rows = await asUser(c.get('userId'), (db) => db.query('select * from public.my_incoming_requests()'));
  return c.json(rows.rows);
});

conversations.post('/requests/:id/respond', async (c) => {
  const { accept, minutes = 30 } = await body<{ accept?: boolean; minutes?: number }>(c);
  if (typeof accept !== 'boolean') throw new HTTPException(400, { message: 'accept must be true or false.' });
  return c.json(
    await rpc(c.get('userId'), 'public.respond_to_request($1, $2, $3)', [c.req.param('id'), Boolean(accept), minutes]),
  );
});

// ------------------------------------------------------- the conversation ---
/** The live conversation (or one by id): their first name, shared overlap, timer. */
conversations.get('/me/conversation', async (c) =>
  c.json(await rpc(c.get('userId'), 'public.my_conversation($1)', [c.req.query('id') ?? null])),
);

/**
 * Gemini conversation prompts from the shared overlap only (PRD data limits:
 * shared words + venue type; no names, ages, ids or needs).
 */
conversations.get('/me/conversation/topics', async (c) => {
  const conv = await rpc<{ id: string; shared: { interests: string[]; topics: string[]; languages: string[] } } | null>(
    c.get('userId'),
    'public.my_conversation(null)',
  );
  if (!conv) throw new HTTPException(404, { message: 'No conversation in progress.' });

  // Venue only (public data). my_conversation already proved the caller is in
  // this conversation, so reading its venue_id as the system is safe.
  const venue = (
    await asSystem((db) =>
      db.query(
        `select v.name, v.type, v.lat, v.lng
         from public.conversations cv join public.venues v on v.id = cv.venue_id where cv.id = $1`,
        [conv.id],
      ),
    )
  ).rows[0] ?? null;

  const res = await icebreakers({
    cacheKey: `topics:${conv.id}`,
    who: c.get('userId')!,
    shared: conv.shared,
    venue,
    count: 4,
    mode: 'questions',
  });
  return c.json({
    shared: conv.shared,
    prompts: res.lines.length ? res.lines : ['What brought you here today?', 'What have you been into lately?'],
    generated: res.lines.length > 0,
    aiStatus: res.status,
    retryAfterSec: res.retryAfterSec ?? null,
  });
});

conversations.post('/me/conversation/end', async (c) => c.json(await rpc(c.get('userId'), 'public.end_conversation()')));

conversations.post('/me/conversation/extend', async (c) => {
  const { extend } = await body<{ extend?: boolean }>(c);
  return c.json(await rpc(c.get('userId'), 'public.vote_extend($1)', [Boolean(extend)]));
});

conversations.post('/conversations/:id/vote', async (c) => {
  const { vote } = await body<{ vote?: string }>(c);
  if (vote !== 'good' && vote !== 'not_for_me') throw new HTTPException(400, { message: 'vote must be good or not_for_me.' });
  return c.json(await rpc(c.get('userId'), 'public.vote_conversation($1, $2::public.vote)', [c.req.param('id'), vote]));
});

conversations.get('/me/connections', async (c) => {
  const rows = await asUser(c.get('userId'), (db) => db.query('select * from public.my_connections()'));
  return c.json(rows.rows);
});

// ----------------------------------------------------------------- safety ---
const REASONS = ['uncomfortable', 'would_not_leave', 'inappropriate', 'romantic_unwanted', 'other'];

conversations.post('/conversations/:id/report', async (c) => {
  const { reason, note } = await body<{ reason?: string; note?: string }>(c);
  if (!reason || !REASONS.includes(reason)) throw new HTTPException(400, { message: `reason must be one of ${REASONS.join(', ')}.` });
  return c.json(await rpc(c.get('userId'), 'public.report_user($1, $2, $3)', [c.req.param('id'), reason, note ?? null]));
});

conversations.post('/conversations/:id/block', async (c) =>
  c.json(await rpc(c.get('userId'), 'public.block_from_conversation($1)', [c.req.param('id')])),
);

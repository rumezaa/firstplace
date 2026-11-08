import { profileProblem } from '../profileValidation.js';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth, type AuthVars } from '../auth.js';
import { asSystem, asUser } from '../db.js';
import { icebreakers, type Shared } from '../rag.js';

// Everything about the signed-in user. Every query runs as that user, so row
// level security limits it to their own rows.
export const me = new Hono<{ Variables: AuthVars }>();
me.use('*', requireAuth);

const PROFILE_FIELDS = [
  'name', 'interests', 'vibe_tags', 'incognito', 'familiar_faces_opt_in',
  'languages', 'topics', 'comm_pref', 'share_comm_pref', 'share_overlap', 'age_range',
] as const;

me.get('/', async (c) => {
  const row = await asUser(c.get('userId'), (db) =>
    db.query('select * from public.users where id = auth.uid()'),
  );
  return c.json(row.rows[0] ?? null);
});

me.patch('/', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const problem = profileProblem(body);
  if (problem) throw new HTTPException(400, { message: problem });
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const field of PROFILE_FIELDS) {
    if (field in body) {
      values.push(body[field]);
      sets.push(`${field} = $${values.length}`);
    }
  }
  if (sets.length === 0) throw new HTTPException(400, { message: 'Nothing to update.' });
  const row = await asUser(c.get('userId'), (db) =>
    db.query(`update public.users set ${sets.join(', ')} where id = auth.uid() returning *`, values),
  );
  return c.json(row.rows[0]);
});

me.get('/checkins/open', async (c) => {
  const row = await asUser(c.get('userId'), (db) =>
    db.query(
      `select * from public.checkins where checked_out_at is null
       order by checked_in_at desc limit 1`,
    ),
  );
  return c.json(row.rows[0] ?? null);
});

me.get('/checkins', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 30) || 30, 100);
  const rows = await asUser(c.get('userId'), (db) =>
    db.query(
      `select c.*,
              case when v.id is null then null else json_build_object('name', v.name) end as venues,
              case when t.id is null then null
                   else json_build_object('label', t.label, 'is_chat_table', t.is_chat_table) end as tables
       from public.checkins c
       left join public.venues v on v.id = c.venue_id
       left join public.tables t on t.id = c.table_id
       order by c.checked_in_at desc
       limit $1`,
      [limit],
    ),
  );
  return c.json(rows.rows);
});

me.get('/visited-venues', async (c) => {
  const rows = await asUser(c.get('userId'), (db) => db.query('select distinct venue_id from public.checkins'));
  return c.json(rows.rows.map((r) => r.venue_id));
});

me.get('/rewards', async (c) => {
  const rows = await asUser(c.get('userId'), (db) => db.query('select * from public.rewards'));
  return c.json(rows.rows);
});

me.get('/familiar-faces', async (c) => {
  const rows = await asUser(c.get('userId'), (db) => db.query('select * from public.my_familiar_faces()'));
  return c.json(rows.rows);
});

/**
 * Gemini conversation openers for a MUTUAL familiar face. Uses only interests
 * the two people share and the venue they both go to.
 */
me.get('/familiar-faces/:id/openers', async (c) => {
  const id = c.req.param('id');
  const card = (
    await asUser(c.get('userId'), (db) =>
      db.query('select id, venue_name, mutual from public.my_familiar_faces() where id = $1', [id]),
    )
  ).rows[0];
  if (!card) throw new HTTPException(404, { message: 'No such connection.' });
  if (!card.mutual) throw new HTTPException(403, { message: 'Openers unlock once you both say yes.' });

  // The overlap needs both profiles, which only the system can read. Only the
  // overlap (app_private.shared_between) ever leaves the database.
  const ctx = await asSystem(async (db) => {
    const r = await db.query(
      `select app_private.shared_between(ff.user_a, ff.user_b) as shared,
              v.name, v.type, v.lat, v.lng
       from public.familiar_faces ff join public.venues v on v.id = ff.venue_id
       where ff.id = $1`,
      [id],
    );
    return r.rows[0] as { shared: Shared; name: string; type: string; lat: number; lng: number } | undefined;
  });
  const shared: Shared = ctx?.shared ?? {};

  const res = await icebreakers({
    cacheKey: `openers:${id}`,
    who: c.get('userId')!,
    shared,
    venue: ctx ? { name: ctx.name, type: ctx.type, lat: ctx.lat, lng: ctx.lng } : null,
    count: 3,
    mode: 'openers',
  });
  return c.json({
    openers: res.lines.length ? res.lines : [`Hey, I think we're both regulars at ${card.venue_name}!`],
    sharedInterests: shared.interests ?? [],
    generated: res.lines.length > 0,
    aiStatus: res.status,
    retryAfterSec: res.retryAfterSec ?? null,
  });
});

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth, type AuthVars } from '../auth.js';
import { asSystem, asUser } from '../db.js';
import { generate, parseStringList } from '../gemini.js';

// Everything about the signed-in user. Every query runs as that user, so row
// level security limits it to their own rows.
export const me = new Hono<{ Variables: AuthVars }>();
me.use('*', requireAuth);

const PROFILE_FIELDS = [
  'name', 'interests', 'vibe_tags', 'incognito', 'familiar_faces_opt_in',
  'languages', 'topics', 'comm_pref', 'share_comm_pref', 'age_range',
] as const;

me.get('/', async (c) => {
  const row = await asUser(c.get('userId'), (db) =>
    db.query('select * from public.users where id = auth.uid()'),
  );
  return c.json(row.rows[0] ?? null);
});

me.patch('/', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
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

  // Shared interests need both profiles, which only the system can read. We
  // send back the overlap only, never the other person's full list.
  const shared = await asSystem(async (db) => {
    const r = await db.query(
      `select coalesce(array(select unnest(ua.interests) intersect select unnest(ub.interests)), '{}') as shared
       from public.familiar_faces ff
       join public.users ua on ua.id = ff.user_a
       join public.users ub on ub.id = ff.user_b
       where ff.id = $1`,
      [id],
    );
    return (r.rows[0]?.shared ?? []) as string[];
  });

  const text = await generate(
    `openers:${id}`,
    `Two regulars at ${card.venue_name} keep seeing each other and both agreed to say hi. ` +
      `Shared interests: ${shared.length ? shared.join(', ') : 'none known'}. ` +
      `Write 3 short, natural opening lines one of them could say in person. ` +
      `Reply as a JSON array of 3 strings.`,
    60 * 60_000,
    { json: true },
  );
  const openers = parseStringList(text);
  return c.json({
    openers: openers.length ? openers : [`Hey, I think we're both regulars at ${card.venue_name}!`],
    sharedInterests: shared,
    generated: openers.length > 0,
  });
});

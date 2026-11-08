import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AuthVars } from '../auth.js';
import { asUser } from '../db.js';
import { generate } from '../gemini.js';

// Public venue data. Works signed out (as the `anon` role), so the map loads
// before anyone has an account.
export const venues = new Hono<{ Variables: AuthVars }>();

venues.get('/', async (c) => {
  const rows = await asUser(c.get('userId'), (db) => db.query('select * from public.venues order by name'));
  return c.json(rows.rows);
});

venues.get('/live', async (c) => {
  const rows = await asUser(c.get('userId'), (db) => db.query('select * from public.venue_live'));
  return c.json(rows.rows);
});

venues.get('/:id', async (c) => {
  const row = await asUser(c.get('userId'), (db) =>
    db.query('select * from public.venues where id = $1', [c.req.param('id')]),
  );
  if (!row.rows[0]) throw new HTTPException(404, { message: 'No such venue.' });
  return c.json(row.rows[0]);
});

venues.get('/:id/live', async (c) => {
  const row = await asUser(c.get('userId'), (db) =>
    db.query('select * from public.venue_live where venue_id = $1', [c.req.param('id')]),
  );
  return c.json(row.rows[0] ?? null);
});

venues.get('/:id/tables', async (c) => {
  const rows = await asUser(c.get('userId'), (db) =>
    db.query('select * from public.tables where venue_id = $1 order by is_chat_table desc, label', [c.req.param('id')]),
  );
  return c.json(rows.rows);
});

venues.get('/:id/busy-hours', async (c) => {
  const rows = await asUser(c.get('userId'), (db) =>
    db.query('select * from public.venue_busy_hours where venue_id = $1 order by hour_of_day', [c.req.param('id')]),
  );
  return c.json(rows.rows);
});

venues.get('/:id/crowd-tags', async (c) => {
  const rows = await asUser(c.get('userId'), (db) =>
    db.query('select * from public.venue_crowd_tags where venue_id = $1 order by people desc limit 5', [c.req.param('id')]),
  );
  return c.json(rows.rows);
});

/**
 * Gemini: "what it's like inside right now", built only from aggregates
 * (the same numbers anyone can already see), never from individuals.
 */
venues.get('/:id/vibe', async (c) => {
  const id = c.req.param('id');
  const data = await asUser(c.get('userId'), async (db) => {
    const venue = (await db.query('select name, type, insider_info, popular_drinks, is_quiet, good_for_groups from public.venues where id = $1', [id])).rows[0];
    if (!venue) return null;
    const live = (await db.query('select * from public.venue_live where venue_id = $1', [id])).rows[0];
    const tags = (await db.query('select tag from public.venue_crowd_tags where venue_id = $1 order by people desc limit 5', [id])).rows;
    const busy = (await db.query('select hour_of_day, visits from public.venue_busy_hours where venue_id = $1 order by visits desc limit 3', [id])).rows;
    return { venue, live, tags: tags.map((t) => t.tag), busiestHours: busy.map((b) => b.hour_of_day) };
  });
  if (!data) throw new HTTPException(404, { message: 'No such venue.' });

  // Cache per venue and per 10-minute slice, so the line tracks the live counts.
  const slice = Math.floor(Date.now() / 600_000);
  const text = await generate(
    `vibe:${id}:${slice}`,
    `Write 2 short sentences describing what it is like inside this place right now, for someone ` +
      `nervous about walking in alone. Be concrete and friendly. Data (JSON): ${JSON.stringify(data)}`,
  );
  return c.json({ vibe: text ?? data.venue.insider_info ?? null, generated: Boolean(text) });
});

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AuthVars } from '../auth.js';
import { asUser } from '../db.js';
import { env } from '../env.js';
import { generate } from '../gemini.js';
import { areaIsFresh, placesEnabled, syncArea, type Area } from '../places.js';

// Public venue data. Works signed out (as the `anon` role), so the map loads
// before anyone has an account.
export const venues = new Hono<{ Variables: AuthVars }>();

/** A finite number inside [min, max], or null if the parameter was absent//junk. */
function num(raw: string | undefined, min: number, max: number): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/**
 * The part of the map the caller is looking at, or null when they did not say.
 * `radius` is clamped rather than rejected: a zoomed-out map asks for more than
 * Places will give, and silently narrowing it beats an error on the map screen.
 */
function areaFrom(url: URL): Area | null {
  const lat = num(url.searchParams.get('lat') ?? undefined, -90, 90);
  const lng = num(url.searchParams.get('lng') ?? undefined, -180, 180);
  if (lat === null || lng === null) return null;
  const radius = num(url.searchParams.get('radius') ?? undefined, 1, 50_000) ?? env.placesRadiusM;
  const query = (url.searchParams.get('q') ?? '').trim();
  return { lat, lng, radiusM: radius, query: query || undefined };
}

/**
 * The map's venue list.
 *
 * With `lat`/`lng` (and optionally `radius` and a text `q`) this pulls the real
 * places in that circle from Google and returns them nearest-first; without
 * them it is the plain list it has always been. Imported venues are cached per
 * area, so panning the map is not a Google call per frame — see places.ts.
 *
 * A Places failure is not an error here: whatever is already in the database
 * still comes back, which is what keeps the map working offline and with no
 * API key configured.
 */
venues.get('/', async (c) => {
  const url = new URL(c.req.url);
  const area = areaFrom(url);

  // A search has to wait for Google — there is nothing sensible to show until
  // it answers. A plain area sync can happen in the background once we already
  // have a fresh copy, so panning back to somewhere you have been is instant.
  let search = null as Awaited<ReturnType<typeof syncArea>> | null;
  if (area && placesEnabled) {
    if (area.query || !areaIsFresh(area)) search = await syncArea(area);
    else void syncArea(area);
  }

  const rows = await asUser(c.get('userId'), (db) => {
    if (!area) return db.query('select * from public.venues order by name');

    // Rough great-circle distance, good enough to sort a city. There is no
    // earthdistance extension here and PostGIS would be a lot of machinery
    // for an ORDER BY.
    const distance = `6371000 * acos(least(1, greatest(-1,
        sin(radians($1)) * sin(radians(lat)) +
        cos(radians($1)) * cos(radians(lat)) * cos(radians(lng) - radians($2))
      )))`;

    if (area.query) {
      // Google ranks a text search semantically ("somewhere quiet to read"),
      // so the answer is its list of place ids — not a LIKE over our rows.
      // Without Places (no key, or the call failed) fall back to matching the
      // words we hold ourselves, so search still does something useful.
      const ids = search?.placeIds ?? [];
      if (search?.ok && ids.length > 0) {
        return db.query(
          `select *, ${distance} as distance_m
             from public.venues
            where google_place_id = any($3::text[])
            order by array_position($3::text[], google_place_id)`,
          [area.lat, area.lng, ids],
        );
      }
      if (search?.ok) return db.query('select * from public.venues where false');
      return db.query(
        `select *, ${distance} as distance_m
           from public.venues
          where name ilike '%' || $3 || '%' or address ilike '%' || $3 || '%'
          order by distance_m
          limit 60`,
        [area.lat, area.lng, area.query],
      );
    }

    return db.query(
      `select *, ${distance} as distance_m
         from public.venues
        order by distance_m
        limit 60`,
      [area.lat, area.lng],
    );
  });
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

/**
 * The floor view (what an NFC tag at the entrance opens): every table with its
 * light, and whether it's yours. Same privacy as the box: colours only, never
 * who is sitting where.
 */
venues.get('/:id/floor', async (c) => {
  const rows = await asUser(c.get('userId'), (db) =>
    db.query(
      `select t.id, t.label, t.seats, t.is_chat_table, t.box_enabled,
              public.table_light(t.id) as light,
              exists (select 1 from public.checkins k
                      where k.table_id = t.id and k.checked_out_at is null
                        and k.user_id = auth.uid()) as mine
       from public.tables t where t.venue_id = $1
       order by t.is_chat_table desc, t.label`,
      [c.req.param('id')],
    ),
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

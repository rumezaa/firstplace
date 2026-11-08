import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireAuth, type AuthVars } from '../auth.js';
import { calgaryStatus, retrieve, toPublic, type PlaceKind } from '../calgary.js';
import { asSystem, asUser } from '../db.js';
import { calgaryWeekday, hangouts, type Shared } from '../rag.js';

// Hangout planning on public City of Calgary data (RAG: retrieve real places,
// then let Gemini turn them into plans).
export const plans = new Hono<{ Variables: AuthVars }>();

const KINDS: PlaceKind[] = ['park', 'library', 'recreation', 'public art', 'community'];
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Retrieval only, no AI and no login: public places near a point or venue
 * that match some words. Handy for a map layer, and for checking what Gemini
 * will be given.
 */
plans.get('/calgary/places', async (c) => {
  let lat = Number(c.req.query('lat'));
  let lng = Number(c.req.query('lng'));
  const venueId = c.req.query('venueId');
  if (venueId) {
    const v = (await asUser(c.get('userId'), (db) =>
      db.query('select lat, lng from public.venues where id = $1', [venueId]))).rows[0];
    if (!v) throw new HTTPException(404, { message: 'No such venue.' });
    ({ lat, lng } = v);
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new HTTPException(400, { message: 'Give lat and lng, or venueId.' });
  }
  const kinds = c.req.query('kind')?.split(',').filter((k): k is PlaceKind => KINDS.includes(k as PlaceKind));
  const terms = (c.req.query('q') ?? '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 10);
  const found = retrieve({
    lat, lng, terms,
    k: Number(c.req.query('k')) || 8,
    radiusKm: Math.min(Number(c.req.query('radiusKm')) || 3, 25),
    kinds: kinds?.length ? kinds : undefined,
  });
  return c.json({ places: found.map(toPublic), corpus: calgaryStatus() });
});

/**
 * Next-hangout ideas for a connection (both people voted "good"). Uses only
 * what they share plus public places near where they met.
 * Query: ?q=something outdoors (optional, max 80 chars) &day=saturday
 */
plans.get('/me/connections/:id/hangouts', requireAuth, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId')!;
  // my_connections() enforces membership and hides blocked pairs.
  const conn = (await asUser(userId, (db) =>
    db.query('select id, shared from public.my_connections() where id = $1', [id]))).rows[0] as
    { id: string; shared: Shared } | undefined;
  if (!conn) throw new HTTPException(404, { message: 'No such connection.' });

  const venue = (await asSystem((db) =>
    db.query(
      `select v.name, v.type, v.lat, v.lng
       from public.connections cn
       join public.conversations cv on cv.id = cn.conversation_id
       join public.venues v on v.id = cv.venue_id
       where cn.id = $1`,
      [id],
    ))).rows[0] ?? null;

  const day = DAYS.includes(c.req.query('day') ?? '') ? c.req.query('day')! : calgaryWeekday();
  const request = c.req.query('q')?.slice(0, 80);
  const res = await hangouts({
    // The free-text request is part of the key, so different asks get different plans.
    cacheKey: `hangouts:${id}:${day}:${(request ?? '').toLowerCase()}`,
    who: userId,
    shared: conn.shared,
    venue,
    request,
    day,
  });
  return c.json({
    plans: res.plans,
    generated: res.generated,
    aiStatus: res.status,
    retryAfterSec: res.retryAfterSec ?? null,
    source: 'City of Calgary Open Data (data.calgary.ca)',
  });
});

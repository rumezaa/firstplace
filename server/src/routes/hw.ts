import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { timingSafeEqual } from 'node:crypto';
import { asSystem } from '../db.js';
import { env } from '../env.js';

// The chat-table light (ESP32). It polls this every ~2 seconds.
//
// FAIL CLOSED: the light is only "welcome" when somebody is checked in at the
// table and EVERY person at it is open to chat. Any "no" turns it off. The
// device should also go dark by itself if it hears nothing for 10 seconds.
//
// The response is counts only: the device never learns who is sitting there.
export const hw = new Hono();

function validKey(given: string | undefined): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  return env.hwDeviceKeys.some((k) => {
    const b = Buffer.from(k);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

hw.get('/tables/:tableId/state', async (c) => {
  if (!validKey(c.req.header('x-device-key'))) throw new HTTPException(401, { message: 'Unknown device.' });

  const state = await asSystem(async (db) => {
    const r = await db.query<{ seats: number; is_chat_table: boolean; seated: number; open: number }>(
      `select t.seats, t.is_chat_table,
              count(ac.id)::int                               as seated,
              count(ac.id) filter (where ac.open_to_chat)::int as open
       from public.tables t
       left join app_private.active_checkins ac on ac.table_id = t.id
       where t.id = $1
       group by t.id`,
      [c.req.param('tableId')],
    );
    return r.rows[0];
  });
  if (!state) throw new HTTPException(404, { message: 'No such table.' });

  // Incognito people are not in active_checkins at all. That can only make the
  // light go off (via the table's own status) — never on.
  const everyoneOpen = state.seated > 0 && state.open === state.seated;
  const light = !state.is_chat_table || !everyoneOpen ? 'off' : state.seated >= state.seats ? 'full' : 'welcome';

  return c.json({ light, lit: light !== 'off', openToChat: everyoneOpen ? state.open : 0, at: new Date().toISOString() });
});

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { timingSafeEqual } from 'node:crypto';
import { asSystem } from '../db.js';
import { env } from '../env.js';

// The First Place box (ESP32). It polls this every ~2 seconds and shows one
// light: off | green | yellow | red. The rules live in public.table_light()
// (db/migrations/080_conversations.sql) and FAIL CLOSED: no claim, box
// disabled, after 10pm or anything unclear → off. Red while a conversation runs.
//
// The device receives a colour and nothing else: no names, no counts of who.
// If it hears nothing for ~10 seconds it must show its "no signal" pattern,
// never a stale green or yellow.
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

  const tableId = c.req.param('tableId');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tableId)) {
    throw new HTTPException(400, { message: 'Table id must be a UUID.' });
  }
  const row = await asSystem((db) =>
    db.query<{ exists: boolean; light: string | null }>(
      'select exists(select 1 from public.tables where id = $1) as exists, public.table_light($1) as light',
      [tableId],
    ),
  );
  // An unknown table is a configuration fault (the box shows it), not a dark table.
  if (!row.rows[0]?.exists) throw new HTTPException(404, { message: 'No such table.' });
  const light = row.rows[0].light ?? 'off';
  return c.json({ light, at: new Date().toISOString(), pollMs: 2000 });
});

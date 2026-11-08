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

  const row = await asSystem((db) =>
    db.query<{ light: string | null }>('select public.table_light($1) as light', [c.req.param('tableId')]),
  );
  const light = row.rows[0]?.light ?? 'off';
  return c.json({ light, at: new Date().toISOString(), pollMs: 2000 });
});

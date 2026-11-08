import pg from 'pg';
import { env } from './env.js';
import { pgConfig } from './pgConfig.js';

export const pool = new pg.Pool({ ...pgConfig(env.databaseUrl), max: 10 });

export type Db = pg.PoolClient;

/**
 * Run `fn` as a specific app user, inside one transaction.
 *
 * This is the whole privacy model: the connection drops to the `authenticated`
 * (or `anon`) role, so every row-level security policy in db/migrations
 * applies, and auth.uid() returns this user's id. The server never filters
 * rows itself, so forgetting a WHERE clause cannot leak anyone's data.
 */
export async function asUser<T>(userId: string | null, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(userId ? 'set local role authenticated' : 'set local role anon');
    await client.query("select set_config('request.user_id', $1, true)", [userId ?? '']);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Full-privilege access. Only for provisioning users, jobs and the hardware endpoint. */
export async function asSystem<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';

/**
 * Connection settings for local Docker and Tiger Cloud alike.
 *
 * Tiger signs database certificates with its own CA (ca.timescale.com), not a
 * public one, so Node rejects the chain by default. Instead of turning
 * verification off, we trust that CA explicitly (certs/timescale-ca.pem):
 * the connection is encrypted AND the server's identity is checked.
 *
 * The ?sslmode=… parameter in Tiger's URL is removed because node-postgres
 * lets it override the ssl option below.
 */
const CA_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../certs/timescale-ca.pem');

export function pgConfig(url: string): pg.ClientConfig {
  const parsed = new URL(url);
  const isLocal = ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if (isLocal) return { connectionString: url };

  parsed.searchParams.delete('sslmode');
  return {
    connectionString: parsed.toString(),
    ssl: { ca: readFileSync(CA_PATH, 'utf8'), rejectUnauthorized: true },
  };
}

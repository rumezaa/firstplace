// Applies db/migrations/*.sql in order, then db/seed.sql (skip with --no-seed).
// Run: npm run db:setup    (uses DATABASE_URL from server/.env)
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { pgConfig } from '../src/pgConfig.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set.');

const dbDir = path.resolve(import.meta.dirname, '../../db');
const files = (await readdir(path.join(dbDir, 'migrations'))).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => path.join(dbDir, 'migrations', f));
if (!process.argv.includes('--no-seed')) files.push(path.join(dbDir, 'seed.sql'));

const client = new pg.Client(pgConfig(url));
await client.connect();
for (const file of files) {
  try {
    await client.query(await readFile(file, 'utf8'));
    console.log(`✓ ${path.basename(file)}`);
  } catch (err) {
    console.error(`✗ ${path.basename(file)}: ${(err as Error).message}`);
    process.exitCode = 1;
    break;
  }
}
await client.end();

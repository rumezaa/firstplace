import { asSystem } from './db.js';

// Background jobs (what pg_cron did on Supabase). They run inside the API
// process; with one Vultr box that's all we need.
const jobs: { name: string; everyMs: number; sql: string }[] = [
  { name: 'auto check-out (3h)', everyMs: 5 * 60_000, sql: 'select public.auto_checkout_stale() as n' },
  { name: 'end timed conversations', everyMs: 60_000, sql: 'select app_private.end_expired_conversations() as n' },
  { name: 'familiar faces matcher', everyMs: 15 * 60_000, sql: 'select public.refresh_familiar_faces() as n' },
  { name: '10pm box shutoff', everyMs: 60_000, sql: 'select app_private.close_boxes_for_night() as n' },
  { name: 'forget check-ins older than 90 days', everyMs: 24 * 60 * 60_000, sql: 'select app_private.purge_old_checkins() as n' },
];

export function startJobs(): void {
  for (const job of jobs) {
    const run = async () => {
      try {
        const r = await asSystem((db) => db.query(job.sql));
        const n = r.rows[0]?.n;
        if (n) console.log(`[jobs] ${job.name}: ${n}`);
      } catch (err) {
        console.warn(`[jobs] ${job.name} failed:`, (err as Error).message);
      }
    };
    void run();
    setInterval(run, job.everyMs).unref();
  }
}

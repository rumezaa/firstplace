import { asSystem } from './db.js';
import { env } from './env.js';
import { DEFAULT_AREA, placesEnabled, syncArea } from './places.js';

// Background jobs (what pg_cron did on Supabase). They run inside the API
// process; with one Vultr box that's all we need.
interface Job {
  name: string;
  everyMs: number;
  /** Returns a count to log, or nothing to stay quiet. */
  run: () => Promise<number | void>;
}

function sqlJob(name: string, everyMs: number, sql: string): Job {
  return {
    name,
    everyMs,
    run: async () => {
      const r = await asSystem((db) => db.query(sql));
      return r.rows[0]?.n as number | undefined;
    },
  };
}

const jobs: Job[] = [
  sqlJob('expire conversations and away holds', 5_000, 'select app_private.expire_conversation_state() as n'),
  sqlJob('expire meetups', 60_000, 'select app_private.expire_stale_meetups() as n'),
  sqlJob('10pm box shutoff', 60_000, 'select app_private.close_boxes_for_night() as n'),
  sqlJob('forget check-ins older than 90 days', 24 * 60 * 60_000, 'select app_private.purge_old_checkins() as n'),
];

// Keep the home area's real places (and their open-now flag) warm, so the
// first phone of the day doesn't wait on Google. Off without an API key.
if (placesEnabled && env.placesSyncMinutes > 0) {
  jobs.push({
    name: 'Google Places refresh',
    everyMs: env.placesSyncMinutes * 60_000,
    run: async () => {
      // The per-area cache would skip a run this often; the job is the one
      // caller that should always go out to Google.
      const { written } = await syncArea({ ...DEFAULT_AREA, nocache: true });
      return written;
    },
  });
}

export function startJobs(): void {
  for (const job of jobs) {
    const run = async () => {
      try {
        const n = await job.run();
        if (n) console.log(`[jobs] ${job.name}: ${n}`);
      } catch (err) {
        console.warn(`[jobs] ${job.name} failed:`, (err as Error).message);
      }
    };
    void run();
    setInterval(run, job.everyMs).unref();
  }
}

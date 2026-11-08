// In-memory limits for outbound AI calls. One API box, so memory is enough; if
// we ever run several, move these counters to Postgres or Redis.

/**
 * Fixed-window counter: at most `max` hits per `windowMs` per key. Returns the
 * seconds until the key may try again, or 0 when the hit was allowed.
 */
export class WindowLimiter {
  private hits = new Map<string, { start: number; count: number }>();

  constructor(private readonly max: number, private readonly windowMs: number) {}

  /** Seconds to wait if `key` is over the limit right now (does not count a hit). */
  retryAfter(key: string, now = Date.now()): number {
    const w = this.hits.get(key);
    if (!w || now - w.start >= this.windowMs || w.count < this.max) return 0;
    return Math.ceil((w.start + this.windowMs - now) / 1000);
  }

  hit(key: string, now = Date.now()): void {
    const w = this.hits.get(key);
    if (!w || now - w.start >= this.windowMs) this.hits.set(key, { start: now, count: 1 });
    else w.count++;
    // Keep the map from growing without bound.
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (now - v.start >= this.windowMs) this.hits.delete(k);
    }
  }
}

/** Caps how many calls run at once. Waiting callers give up after `waitMs`. */
export class Semaphore {
  private active = 0;
  private queue: (() => void)[] = [];

  constructor(private readonly max: number) {}

  /** Resolves to a release function, or null if no slot opened within waitMs. */
  acquire(waitMs: number): Promise<(() => void) | null> {
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve(this.releaser());
    }
    return new Promise((resolve) => {
      const grant = () => {
        clearTimeout(timer);
        this.active++;
        resolve(this.releaser());
      };
      const timer = setTimeout(() => {
        this.queue = this.queue.filter((g) => g !== grant);
        resolve(null);
      }, waitMs);
      this.queue.push(grant);
    });
  }

  private releaser(): () => void {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.active--;
      this.queue.shift()?.();
    };
  }
}

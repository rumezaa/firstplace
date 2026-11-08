import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  /** Re-runs the loader. Safe to pass straight to a RefreshControl. */
  reload: () => Promise<void>;
}

/**
 * Minimal data loader: run an async function, expose {data, error, loading}.
 *
 * Deliberately small. If this project grows past the hackathon, swap it for
 * TanStack Query rather than adding caching and retries in here.
 *
 * `deps` works like useEffect's dependency array.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  const mounted = useRef(true);
  const generation = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Invalidate requests, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, []);

  // Custom loader hook intentionally accepts a caller-owned dependency list.
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo
  const run = useCallback(loader, deps);

  const reload = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const next = await run();
      if (mounted.current && request === generation.current) {
        setData(next);
        setError(null);
      }
    } catch (e) {
      if (mounted.current && request === generation.current) setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (mounted.current && request === generation.current) setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) { setData(null); void reload(); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { cancelled = true; generation.current++; };
  }, [reload]);

  return { data, error, loading, reload };
}

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
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const next = await run();
      if (mounted.current) {
        setData(next);
        setError(null);
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}

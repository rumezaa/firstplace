import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * "Realtime" by polling. The API server has no push channel, and for a table
 * grid and an open-to-chat count a few seconds of delay is fine. Polling is
 * also the most demo-proof option: no socket to drop, nothing to resubscribe.
 *
 * Polls only while the app is in the foreground, and fires once straight away
 * when it comes back, so returning to the app shows fresh numbers.
 */
function usePolling(onTick: () => void, intervalMs: number, enabled: boolean) {
  // Keep the latest callback without restarting the timer on every render.
  const tick = useRef(onTick);
  useEffect(() => {
    tick.current = onTick;
  }, [onTick]);

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (!timer) timer = setInterval(() => tick.current(), intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        tick.current();
        start();
      } else {
        stop();
      }
    });

    return () => {
      stop();
      sub.remove();
    };
  }, [intervalMs, enabled]);
}

/**
 * Re-runs `onChange` every few seconds so table status and live counts at a
 * venue stay current. venueId is kept for call-site compatibility (the map
 * passes null for "all venues"); the callers already re-read what they need.
 */
export function useVenueTablesRealtime(
  _venueId: string | null,
  onChange: () => void,
  enabled = true,
) {
  usePolling(onChange, 5_000, enabled);
}

/** Re-runs `onChange` periodically for the signed-in user's own check-ins. */
export function useMyCheckinsRealtime(onChange: () => void, enabled = true) {
  usePolling(onChange, 10_000, enabled);
}

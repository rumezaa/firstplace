import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';

/**
 * Re-runs `onChange` whenever table status changes at a venue.
 *
 * WHY ONLY `tables`: realtime respects RLS. `public.tables` is public data —
 * a row says "table 4 is taken", never who is sitting there — so it is safe to
 * broadcast. The open-to-chat count lives in the `venue_live` VIEW, and views
 * cannot be subscribed to, so the pattern is: listen on tables, then re-read
 * venue_live. Every check-in claims a table, so a table event always
 * accompanies someone arriving or leaving. See migration 0600.
 *
 * Pass venueId = null to listen across all venues (the map does this).
 *
 * TODO(realtime): this is wired up but untested against a live Supabase
 * project — nobody has run it with two devices yet. Things to check:
 *   1. Realtime is enabled for `public.tables` in the dashboard (the migration
 *      adds it to the publication, but confirm it shows up under
 *      Database > Replication).
 *   2. Debounce. Staff tapping across a kiosk grid fires one event per tile,
 *      and each one currently triggers a full re-read.
 *   3. Resubscribe after the app returns from background — the socket drops and
 *      supabase-js does not always notice.
 */
export function useVenueTablesRealtime(
  venueId: string | null,
  onChange: () => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel(venueId ? `tables:${venueId}` : 'tables:all')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tables',
          ...(venueId ? { filter: `venue_id=eq.${venueId}` } : {}),
        },
        () => onChange(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [venueId, onChange, enabled]);
}

/**
 * Fires when the signed-in user's own check-ins change.
 *
 * RLS limits `checkins` to `user_id = auth.uid()`, so a subscriber only ever
 * receives their OWN rows. That makes this safe, and also means it cannot be
 * used to count other people.
 *
 * TODO(realtime): same caveats as above.
 */
export function useMyCheckinsRealtime(onChange: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel('my-checkins')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkins' }, () => onChange())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [onChange, enabled]);
}

-- ============================================================================
-- Third Place — realtime
-- ============================================================================
-- Realtime respects RLS, so what you add to the publication decides what can
-- leak. Read this before adding anything else.

-- public.tables is safe to broadcast: its select policy is `using (true)` and a
-- row only ever says "table 4 at venue X is taken", never who is sitting there.
-- This is what makes the map, the venue table grid and the kiosk update live.
--
-- Guarded because `alter publication ... add table` raises if the table is
-- already a member, which would break a re-run of this migration.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'tables'
  ) then
    alter publication supabase_realtime add table public.tables;
  end if;
end $$;

-- public.checkins is added too, but note carefully what that does and does not
-- do. Its select policy is `user_id = auth.uid()`, so a subscriber receives
-- events only for their OWN check-ins. That is enough to drive "you are
-- checked in here" state across devices, and it cannot reveal other people.
--
-- It is NOT how the open-to-chat count updates. That count lives in
-- public.venue_live, which is a view and cannot be subscribed to. The client
-- pattern is: subscribe to public.tables for the venue, and on any event
-- re-read venue_live. Every check-in claims a table, so a table event always
-- accompanies someone arriving or leaving.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'checkins'
  ) then
    alter publication supabase_realtime add table public.checkins;
  end if;
end $$;

-- Do NOT add public.users (names), public.kiosk_codes (anyone could then
-- harvest live codes) or public.familiar_faces without thinking through what a
-- subscriber would see.

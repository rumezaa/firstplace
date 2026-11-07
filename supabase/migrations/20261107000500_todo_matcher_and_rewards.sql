-- ============================================================================
-- Third Place — familiar faces matcher + rewards  (NOT IMPLEMENTED YET)
-- ============================================================================
-- Both functions below are deliberate stubs. They exist so the client code and
-- the scheduled job can be wired up now, and so the signatures are settled
-- before two people start writing against them.
--
-- The seed script inserts a familiar_faces row directly, so the Connections
-- screen has something real to show during the demo even while this is a stub.

-- ---------------------------------------------------------------------------
-- TODO(familiar-faces): implement this.
-- ---------------------------------------------------------------------------
-- What it has to do: find pairs of opted-in, non-incognito users whose
-- check-ins at the same venue overlapped in time on 3 or more separate
-- occasions, and insert or update one familiar_faces row per pair per venue.
-- Plain SQL counting. No ML.
--
-- Starting point -- this is believed correct but has NOT been run or tested:
--
--   with sessions as (
--     select
--       cc.user_id,
--       cc.venue_id,
--       tstzrange(
--         cc.checked_in_at,
--         least(coalesce(cc.checked_out_at, now()),
--               cc.checked_in_at + public.session_length())
--       ) as window
--     from app_private.countable_checkins cc
--     join public.users u on u.id = cc.user_id
--     where u.familiar_faces_opt_in
--       and cc.checked_in_at > now() - interval '90 days'
--   ),
--   overlaps as (
--     select
--       least(a.user_id, b.user_id)    as user_a,
--       greatest(a.user_id, b.user_id) as user_b,
--       a.venue_id,
--       count(*)::int                  as overlap_count,
--       max(upper(a.window * b.window)) as last_overlap_at,
--       -- the weekday most of the overlaps land on, for the card copy
--       (mode() within group (
--          order by extract(dow from lower(a.window * b.window)
--                           at time zone public.local_tz())
--        ))::smallint                  as common_weekday
--     from sessions a
--     join sessions b
--       on a.venue_id = b.venue_id
--      and a.user_id < b.user_id       -- each unordered pair once
--      and a.window && b.window        -- they were actually there together
--     group by 1, 2, 3
--     having count(*) >= 3             -- "3 or more times"
--   )
--   insert into public.familiar_faces
--     (user_a, user_b, venue_id, overlap_count, common_weekday, last_overlap_at)
--   select user_a, user_b, venue_id, overlap_count, common_weekday, last_overlap_at
--   from overlaps
--   on conflict (user_a, user_b, venue_id) do update
--     set overlap_count   = excluded.overlap_count,
--         common_weekday  = excluded.common_weekday,
--         last_overlap_at = excluded.last_overlap_at;
--     -- note: a_accepted / b_accepted are intentionally NOT touched on
--     -- conflict. Re-running the matcher must never reset someone's answer.
--
-- Things to decide while implementing:
--   * Two people at the same venue for 10 overlapping minutes on 3 days is a
--     weaker signal than 3 overlapping afternoons. Consider a minimum overlap
--     duration, e.g. `and upper(a.window * b.window) - lower(...) > interval '20 min'`.
--   * Should overlaps on the *same day* count once or many times? The query
--     above counts each overlapping pair of sessions, so two sessions on one
--     day could count twice.
--   * Decide whether to prune rows that fall back below 3 after the 90 day
--     window slides, or let them sit at their last count.
create or replace function public.refresh_familiar_faces()
returns integer
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  raise notice 'refresh_familiar_faces() is a stub -- see migration 0500.';
  return 0;
end $$;

comment on function public.refresh_familiar_faces() is
  'STUB. See the TODO block in migration 0500 for the intended implementation.';

-- TODO(ops): once implemented, schedule it with pg_cron:
--
--   select cron.schedule(
--     'third-place-familiar-faces',
--     '*/15 * * * *',
--     $$select public.refresh_familiar_faces()$$
--   );

revoke all on function public.refresh_familiar_faces() from public;
-- Not granted to authenticated on purpose: this is a job, not a client call.

-- ---------------------------------------------------------------------------
-- TODO(rewards): implement this.
-- ---------------------------------------------------------------------------
-- Two reward rows per user to maintain:
--
--   type = 'frequent', one row per venue_id
--     progress = weighted visit count at that cafe, where a check-in at the
--     venue's chat table counts 2 and any other check-in counts 1.
--
--     select cc.venue_id,
--            sum(case when t.is_chat_table then 2 else 1 end)::int as progress
--     from app_private.countable_checkins cc
--     left join public.tables t on t.id = cc.table_id
--     where cc.user_id = p_user_id
--     group by cc.venue_id;
--
--   type = 'passport', venue_id = null
--     progress = count(distinct venue_id) for that user. The grid of visited
--     vs unvisited venues on the Rewards screen is drawn from the user's own
--     check-ins, which RLS already allows them to read, so the passport row is
--     really just the headline number.
--
-- Decide: what progress value earns a frequent reward (status -> 'earned')?
-- The Rewards screen currently hardcodes FREQUENT_REWARD_TARGET in
-- src/lib/rewards.ts -- move that here, or keep it client-side and have this
-- function only maintain `progress`.
create or replace function public.recompute_rewards(p_user_id uuid default auth.uid())
returns integer
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if p_user_id is null or p_user_id <> auth.uid() then
    raise exception 'You can only recompute your own rewards.';
  end if;

  raise notice 'recompute_rewards() is a stub -- see migration 0500.';
  return 0;
end $$;

comment on function public.recompute_rewards(uuid) is
  'STUB. See the TODO block in migration 0500 for the intended implementation.';

revoke all on function public.recompute_rewards(uuid) from public;
grant execute on function public.recompute_rewards(uuid) to authenticated;

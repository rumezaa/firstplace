-- ============================================================================
-- FirstPlace — familiar faces matcher (replaces the stub in 050)
-- ============================================================================
-- A card appears when two opted-in people have been at the same venue at the
-- same time on 3 or more separate days in the last 90 days.
--
-- Decisions (the open questions in 050):
--   * Count DAYS, not overlapping session pairs: two overlaps on one day = 1.
--   * An overlap must last at least 20 minutes. Walking past doesn't count.
--   * Incognito visits never count (countable_checkins already drops them).
--   * Both people must have familiar faces switched on; blocked pairs never match.
--   * Re-running never touches a_accepted / b_accepted, and cards that slip
--     below 3 as the window slides are kept, not deleted mid-conversation.
-- Runs from the server every 10 minutes (server/src/jobs.ts). Safe to rerun.

create or replace function public.refresh_familiar_faces()
returns integer
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  v_rows integer;
begin
  with sessions as (
    select cc.user_id, cc.venue_id,
           tstzrange(cc.checked_in_at,
                     least(coalesce(cc.checked_out_at, now()), cc.checked_in_at + public.session_length())) as win
    from app_private.countable_checkins cc
    join public.users u on u.id = cc.user_id
    where u.familiar_faces_opt_in and not u.incognito
      and cc.checked_in_at > now() - interval '90 days'
  ),
  together as (
    select a.user_id as user_a, b.user_id as user_b, a.venue_id,
           a.win * b.win as shared
    from sessions a
    join sessions b
      on a.venue_id = b.venue_id
     and a.user_id < b.user_id
     and a.win && b.win
  ),
  real_overlaps as (
    select user_a, user_b, venue_id, shared,
           (lower(shared) at time zone public.local_tz())::date as local_day
    from together
    where upper(shared) - lower(shared) >= interval '20 minutes'
  ),
  pairs as (
    select user_a, user_b, venue_id,
           count(distinct local_day)::int as overlap_count,
           max(upper(shared)) as last_overlap_at,
           (mode() within group (order by extract(dow from local_day)))::smallint as common_weekday
    from real_overlaps
    where not app_private.is_blocked(user_a, user_b)
    group by user_a, user_b, venue_id
    having count(distinct local_day) >= 3
  )
  insert into public.familiar_faces (user_a, user_b, venue_id, overlap_count, common_weekday, last_overlap_at)
  select user_a, user_b, venue_id, overlap_count, common_weekday, last_overlap_at from pairs
  on conflict (user_a, user_b, venue_id) do update
    set overlap_count   = excluded.overlap_count,
        common_weekday  = excluded.common_weekday,
        last_overlap_at = excluded.last_overlap_at;
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;

comment on function public.refresh_familiar_faces() is
  'Builds familiar_faces from 3+ days of 20+ minute overlaps at the same venue in 90 days. See migration 180.';

revoke all on function public.refresh_familiar_faces() from public;

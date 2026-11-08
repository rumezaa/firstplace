-- ============================================================================
-- FirstPlace — the room by consent: green tables show what you have in common
-- ============================================================================
-- Extends public.venue_room() (170) with `green`: for each table on GREEN
-- (the person has said they want company), the interests you share with them.
--
--   Everyone        → counts only (170).
--   Green           → their table plus shared interests. No name, no profile;
--                     first names stay hidden until you're actually chatting.
--   Yellow / red /
--   not at a table  → nothing beyond the counts.
--
-- Only for people checked in at this venue (you're in the room), never your
-- own table, never between blocked people, and app_private.shared_between()
-- returns nothing when either side has "Show what we have in common" off.
-- Tables with nothing in common are left out. Safe to rerun.

create or replace function public.venue_room(p_venue uuid)
returns jsonb language sql stable security definer set search_path = public, app_private as $$
  with here as (
    select ac.user_id from app_private.active_checkins ac where ac.venue_id = p_venue
  ),
  me as (
    select u.id, u.interests from public.users u
    where u.id = auth.uid() and u.share_overlap
  ),
  shared as (
    -- One row per (person here, interest they share with me).
    select x.interest, h.user_id
    from here h
    join public.users u on u.id = h.user_id
    cross join me
    cross join lateral (select unnest(u.interests) intersect select unnest(me.interests)) x(interest)
    where h.user_id <> me.id
      and u.share_overlap
      and not app_private.is_blocked(me.id, h.user_id)
  ),
  top as (
    select interest, count(distinct user_id)::int as people
    from shared group by interest
    having count(distinct user_id) >= 2
    order by people desc, interest
    limit 1
  ),
  green as (
    select t.id as table_id, t.label, (app_private.table_claim(t.id)).user_id as seated
    from public.tables t
    where t.venue_id = p_venue
      and public.table_light(t.id) = 'green'
      and exists (select 1 from here where user_id = auth.uid())
  ),
  green_shared as (
    select g.table_id, g.label, app_private.shared_between(auth.uid(), g.seated) -> 'interests' as interests
    from green g
    where g.seated is not null
      and g.seated <> auth.uid()
      and not app_private.is_blocked(auth.uid(), g.seated)
  )
  select jsonb_build_object(
    'people_here', (select count(*)::int from here),
    'open_to_talk', (select count(*)::int from public.tables t
                     where t.venue_id = p_venue and public.table_light(t.id) in ('green', 'yellow')),
    'here', exists (select 1 from here where user_id = auth.uid()),
    'like_you', (select jsonb_build_object('interest', interest, 'people', people) from top),
    'green', coalesce((
      select jsonb_agg(jsonb_build_object('table_id', table_id, 'interests', interests) order by label)
      from green_shared where jsonb_array_length(interests) > 0
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.venue_room(uuid) from public;
grant execute on function public.venue_room(uuid) to anon, authenticated;

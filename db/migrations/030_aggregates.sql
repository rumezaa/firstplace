-- ============================================================================
-- FirstPlace — the aggregate layer
-- ============================================================================
-- Everything a client learns about other people comes from this file.
--
-- The views in app_private read across all users (they are owned by the
-- migration role, so they are not subject to RLS) and are never granted to
-- anon or authenticated. The views in public are built on top of them and emit
-- counts only -- no user ids, no names, no "who is here right now".
--
-- Incognito users are filtered out in app_private, once, so no caller can
-- forget to do it.

-- ------------------------------------------------- internal base views ------
-- Live sessions: not checked out, and not older than session_length().
create or replace view app_private.active_checkins as
  select c.*
  from public.checkins c
  join public.users u on u.id = c.user_id
  where c.checked_out_at is null
    and c.checked_in_at > now() - public.session_length()
    and u.incognito = false;

-- Historical sessions that are allowed to feed stats.
create or replace view app_private.countable_checkins as
  select c.*
  from public.checkins c
  join public.users u on u.id = c.user_id
  where u.incognito = false;

revoke all on app_private.active_checkins    from anon, authenticated;
revoke all on app_private.countable_checkins from anon, authenticated;

-- ---------------------------------------------------- live venue status ------
-- Drives the map markers, the bottom-sheet preview and the venue screen.
create or replace view public.venue_live as
with t as (
  select
    venue_id,
    count(*)::int                                             as total_tables,
    count(*) filter (where status = 'open')::int               as open_tables,
    count(*) filter (where is_chat_table)::int                 as chat_tables,
    count(*) filter (where is_chat_table and status = 'open')::int as chat_tables_open
  from public.tables
  group by venue_id
),
c as (
  select
    ac.venue_id,
    count(*) filter (where ac.open_to_chat)::int as people_open_to_chat,
    count(*) filter (where tb.is_chat_table)::int as people_at_chat_table
  from app_private.active_checkins ac
  left join public.tables tb on tb.id = ac.table_id
  group by ac.venue_id
)
select
  v.id                                            as venue_id,
  coalesce(t.total_tables, 0)                     as total_tables,
  coalesce(t.open_tables, 0)                      as open_tables,
  coalesce(t.chat_tables, 0) > 0                  as has_chat_table,
  coalesce(t.chat_tables_open, 0) > 0             as chat_table_open,
  coalesce(c.people_open_to_chat, 0)              as people_open_to_chat,
  -- "the chat table is active" means somebody is actually sitting at it.
  coalesce(c.people_at_chat_table, 0) > 0         as chat_table_active,
  case
    when coalesce(t.total_tables, 0) = 0                                 then 'open'
    when coalesce(t.open_tables, 0) = 0                                  then 'full'
    when t.open_tables::numeric / t.total_tables <= 0.34                  then 'filling_up'
    else 'open'
  end                                             as availability
from public.venues v
left join t on t.venue_id = v.id
left join c on c.venue_id = v.id;

comment on view public.venue_live is
  'Per-venue live counts. Safe to expose: contains no user ids and no names.';

-- ------------------------------------------------------- busiest hours ------
create or replace view public.venue_busy_hours as
select
  cc.venue_id,
  extract(hour from cc.checked_in_at at time zone public.local_tz())::int as hour_of_day,
  count(*)::int as visits
from app_private.countable_checkins cc
where cc.checked_in_at > now() - interval '60 days'
group by 1, 2;

comment on view public.venue_busy_hours is
  'Check-in counts by local hour over the last 60 days. Aggregate only.';

-- ---------------------------------------------------------- crowd type ------
-- "Crowd type, aggregated only": the vibe tags of people who have been here
-- recently. The having clause is the privacy guard -- a tag held by one or two
-- people would describe an individual, so it is not published at all.
create or replace view public.venue_crowd_tags as
select
  cc.venue_id,
  tag,
  count(distinct cc.user_id)::int as people
from app_private.countable_checkins cc
join public.users u on u.id = cc.user_id
cross join unnest(u.vibe_tags) as tag
where cc.checked_in_at > now() - interval '30 days'
group by 1, 2
having count(distinct cc.user_id) >= 3;

comment on view public.venue_crowd_tags is
  'Vibe tags held by at least 3 distinct recent visitors. Below 3 the tag is
   suppressed so it cannot describe one identifiable person.';

grant select on public.venue_live       to anon, authenticated;
grant select on public.venue_busy_hours to anon, authenticated;
grant select on public.venue_crowd_tags to anon, authenticated;

-- ----------------------------------------------------- owner dashboard ------
-- Minimum group size for anything on the cafe owner dashboard.
create or replace function public.dashboard_min_group_size()
returns integer language sql immutable parallel safe as $$ select 5; $$;

create or replace function public.venue_dashboard(p_venue_id uuid, p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private
stable
as $$
declare
  v_min        integer := public.dashboard_min_group_size();
  v_visitors   integer;
  v_result     jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to view a venue dashboard.';
  end if;

  -- TODO(auth): restrict this to the owner of p_venue_id once there is a
  -- venue_staff / venue_owners table. Today any signed-in account can open the
  -- dashboard for any venue. It only ever returns aggregates, so this is a
  -- demo-grade gap rather than a leak of individual data.

  select count(distinct user_id) into v_visitors
  from app_private.countable_checkins
  where venue_id = p_venue_id
    and checked_in_at > now() - make_interval(days => p_days);

  -- Privacy rule: no aggregate below the minimum group size, at all.
  if coalesce(v_visitors, 0) < v_min then
    return jsonb_build_object(
      'suppressed',      true,
      'min_group_size',  v_min,
      'days',            p_days
    );
  end if;

  select jsonb_build_object(
    'suppressed',     false,
    'min_group_size', v_min,
    'days',           p_days,
    'visitors',       v_visitors,
    'total_visits',   (
      select count(*)::int from app_private.countable_checkins
      where venue_id = p_venue_id and checked_in_at > now() - make_interval(days => p_days)
    ),
    -- share of visitors who came more than once in the window
    'repeat_visit_rate', (
      select round(
        coalesce(
          count(*) filter (where visits > 1)::numeric / nullif(count(*), 0),
          0
        ), 3)
      from (
        select user_id, count(*) as visits
        from app_private.countable_checkins
        where venue_id = p_venue_id and checked_in_at > now() - make_interval(days => p_days)
        group by user_id
      ) per_user
    ),
    'chat_table_visits', (
      select count(*)::int
      from app_private.countable_checkins cc
      join public.tables t on t.id = cc.table_id
      where cc.venue_id = p_venue_id
        and cc.checked_in_at > now() - make_interval(days => p_days)
        and t.is_chat_table
    ),
    'open_to_chat_visits', (
      select count(*)::int
      from app_private.countable_checkins
      where venue_id = p_venue_id
        and checked_in_at > now() - make_interval(days => p_days)
        and open_to_chat
    ),
    'peak_hours', (
      select coalesce(jsonb_agg(jsonb_build_object('hour', hour_of_day, 'visits', visits)
                                order by hour_of_day), '[]'::jsonb)
      from (
        select extract(hour from checked_in_at at time zone public.local_tz())::int as hour_of_day,
               count(*)::int as visits
        from app_private.countable_checkins
        where venue_id = p_venue_id and checked_in_at > now() - make_interval(days => p_days)
        group by 1
      ) h
    )
  ) into v_result;

  return v_result;
end $$;

comment on function public.venue_dashboard(uuid, integer) is
  'Cafe owner dashboard. Returns {suppressed: true} rather than any number when
   fewer than dashboard_min_group_size() distinct people visited in the window.';

revoke all on function public.venue_dashboard(uuid, integer) from public;
grant execute on function public.venue_dashboard(uuid, integer) to authenticated;

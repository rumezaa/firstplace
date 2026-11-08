-- ============================================================================
-- FirstPlace: TimescaleDB layer (Tiger Data)
-- ============================================================================
-- Two kinds of check-in data, with different lifetimes:
--
--   public.checkins        personal: who sat where. Needed for your own history
--                          and familiar faces. Purged after 90 days.
--   public.checkin_events  anonymous: venue, table, time. No user id, no
--                          incognito users, ever. A TimescaleDB hypertable that
--                          feeds the busy-hours and dashboard aggregates.
--
-- So the long-term stats a cafe sees are built from data that never knew who
-- you were, and the data that did know is forgotten on a schedule.
--
-- Works without TimescaleDB too (plain table, plain view), so a laptop
-- Postgres can still run every migration.

do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'timescaledb') then
    create extension if not exists timescaledb;
  end if;
end $$;

create table if not exists public.checkin_events (
  at            timestamptz not null,
  venue_id      uuid        not null references public.venues (id) on delete cascade,
  table_id      uuid,
  is_chat_table boolean     not null default false,
  open_to_chat  boolean     not null default false
);

comment on table public.checkin_events is
  'Anonymous check-in events: no user id by design. Incognito check-ins are never written here.';

-- No RLS here (TimescaleDB can't build continuous aggregates on RLS tables).
-- Instead, clients get no privileges on it at all: only the definer-rights
-- trigger writes it and only the aggregate views read it.
revoke all on public.checkin_events from anon, authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'timescaledb') then
    perform create_hypertable('public.checkin_events', 'at',
                              chunk_time_interval => interval '7 days',
                              if_not_exists => true);
  else
    create index if not exists checkin_events_venue_at_idx on public.checkin_events (venue_id, at desc);
  end if;
end $$;

-- Every new check-in writes one anonymous event, unless the user is incognito.
create or replace function app_private.record_checkin_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.users u where u.id = new.user_id and u.incognito) then
    return new;
  end if;

  insert into public.checkin_events (at, venue_id, table_id, is_chat_table, open_to_chat)
  values (
    new.checked_in_at,
    new.venue_id,
    new.table_id,
    coalesce((select t.is_chat_table from public.tables t where t.id = new.table_id), false),
    new.open_to_chat
  );
  return new;
end $$;

drop trigger if exists checkins_record_event on public.checkins;
create trigger checkins_record_event
  after insert on public.checkins
  for each row execute function app_private.record_checkin_event();

-- Hourly totals per venue. A continuous aggregate on Tiger, a plain view elsewhere.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'timescaledb') then
    if not exists (select 1 from timescaledb_information.continuous_aggregates
                   where view_schema = 'app_private' and view_name = 'venue_hourly') then
      execute $cagg$
        create materialized view app_private.venue_hourly
        with (timescaledb.continuous) as
        select venue_id,
               time_bucket(interval '1 hour', at) as bucket,
               count(*)::int                                 as visits,
               count(*) filter (where open_to_chat)::int     as open_to_chat_visits,
               count(*) filter (where is_chat_table)::int    as chat_table_visits
        from public.checkin_events
        group by venue_id, bucket
        with no data
      $cagg$;
      perform add_continuous_aggregate_policy('app_private.venue_hourly',
        start_offset      => interval '120 days',
        end_offset        => interval '0 minutes',
        schedule_interval => interval '15 minutes');
      -- Real-time aggregation: include not-yet-materialized rows in queries.
      execute 'alter materialized view app_private.venue_hourly set (timescaledb.materialized_only = false)';
    end if;
  else
    execute $view$
      create or replace view app_private.venue_hourly as
      select venue_id,
             date_trunc('hour', at)                        as bucket,
             count(*)::int                                 as visits,
             count(*) filter (where open_to_chat)::int     as open_to_chat_visits,
             count(*) filter (where is_chat_table)::int    as chat_table_visits
      from public.checkin_events
      group by venue_id, bucket
    $view$;
  end if;
end $$;

-- Busy hours now come from the anonymous aggregate instead of personal rows.
-- Same columns as before, so the app does not change.
create or replace view public.venue_busy_hours as
select venue_id,
       extract(hour from bucket at time zone public.local_tz())::int as hour_of_day,
       sum(visits)::int                                              as visits
from app_private.venue_hourly
where bucket > now() - interval '60 days'
group by 1, 2;

grant select on public.venue_busy_hours to anon, authenticated;

-- Personal check-ins are forgotten after 90 days (familiar faces only looks back 90).
create or replace function app_private.purge_old_checkins()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  delete from public.checkins
  where checked_out_at is not null
    and checked_in_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

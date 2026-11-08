-- ============================================================================
-- FirstPlace: planning the next one (weather-aware meetups)
-- ============================================================================
-- The box gets two strangers talking once. This is the layer that turns that
-- single conversation into a second meeting, which is where "familiar face"
-- becomes "friend".
--
-- The shape deliberately mirrors the rest of the app rather than a generic AI
-- trip planner:
--
--   * Double opt-in, again. A plan is a *proposal*. It is only real when both
--     people have said yes, exactly like a chat request or a familiar face.
--   * Neither person can read the other's calendar. Each side submits the
--     windows that work for them; public.meetup_overlap() returns the
--     INTERSECTION and only once both have answered. There is no query that
--     returns one person's windows to the other, so the feature cannot be used
--     to probe when someone is free (or, worse, when they are not home).
--   * The suggestion is justified by the overlap only. It is built from
--     app_private.shared_between(), the same 3-interest/5-topic intersection the
--     conversation card uses, so a plan never discloses a one-sided interest.
--   * Weather and venues are chosen by the API (db/../server/src/planner.ts),
--     but every *permission* question is answered here.
--
-- Times are coarse on purpose: a day plus morning/afternoon/evening. That is
-- all the forecast can honestly support a week out, and it keeps this from
-- becoming a location-sharing feature.

-- ------------------------------------------------------------------ enums ----
do $$ begin
  create type public.part_of_day as enum ('morning', 'afternoon', 'evening');
exception when duplicate_object then null; end $$;

do $$ begin
  -- collecting -> both pick times | proposed -> a plan exists, awaiting yes
  -- confirmed  -> both said yes   | declined -> either said no, or cancelled
  -- expired    -> nobody finished it, or the day came and went
  create type public.meetup_status as enum ('collecting', 'proposed', 'confirmed', 'declined', 'expired');
exception when duplicate_object then null; end $$;

-- -------------------------------------------------------------- constants ----
-- How far ahead a plan may reach. Open-Meteo gives a useful forecast for about
-- this long; past it the weather half of the feature would be guesswork.
create or replace function public.meetup_horizon_days()
returns integer language sql immutable parallel safe as $$ select 14 $$;

-- A plan nobody finishes should not sit in the list forever.
create or replace function public.meetup_ttl()
returns interval language sql immutable parallel safe as $$ select interval '10 days' $$;

-- ------------------------------------------------------------------ tables ---
create table if not exists public.meetups (
  id            uuid primary key default gen_random_uuid(),
  connection_id uuid                 not null references public.connections (id) on delete cascade,
  opened_by     uuid                 not null references public.users (id)       on delete cascade,
  status        public.meetup_status not null default 'collecting',
  -- The itinerary the API built: chosen window, idea, venue, forecast, backup.
  -- Written only by public.record_meetup_plan().
  plan          jsonb,
  plan_built_at timestamptz,
  -- a_accepted is public.connections.user_a's answer, b_accepted is user_b's.
  a_accepted    boolean              not null default false,
  b_accepted    boolean              not null default false,
  created_at    timestamptz          not null default now(),
  decided_at    timestamptz
);

comment on table public.meetups is
  'One attempt at arranging a second meeting between two connected people.';

-- At most one plan in flight per pair: a second "plan the next one" tap resumes
-- the existing one instead of starting a competing proposal.
create unique index if not exists meetups_one_live_per_connection
  on public.meetups (connection_id) where status in ('collecting', 'proposed');

create index if not exists meetups_connection_idx on public.meetups (connection_id, created_at desc);
create index if not exists meetups_live_idx on public.meetups (status) where status in ('collecting', 'proposed');

-- Each person's own free windows. One row per day + part of day they tick.
create table if not exists public.meetup_availability (
  meetup_id  uuid                not null references public.meetups (id)  on delete cascade,
  user_id    uuid                not null references public.users (id)    on delete cascade,
  day        date                not null,
  part       public.part_of_day  not null,
  created_at timestamptz         not null default now(),
  primary key (meetup_id, user_id, day, part)
);

comment on table public.meetup_availability is
  'Private to each user. Readable only through public.meetup_overlap(), which
   returns the intersection of both sides and only after both have submitted.';

create index if not exists meetup_availability_meetup_idx on public.meetup_availability (meetup_id, day);

-- --------------------------------------------------------------------- RLS ---
alter table public.meetups             enable row level security;
alter table public.meetup_availability enable row level security;

-- Participants may read the meetup row itself (status and the agreed plan).
drop policy if exists meetups_own on public.meetups;
create policy meetups_own on public.meetups for select to authenticated
  using (exists (
    select 1 from public.connections c
    where c.id = meetups.connection_id and auth.uid() in (c.user_a, c.user_b)
  ));

-- Availability is strictly your own row, even from the person you are planning
-- with. The overlap is computed in a security-definer function instead.
drop policy if exists meetup_availability_mine on public.meetup_availability;
create policy meetup_availability_mine on public.meetup_availability for select to authenticated
  using (user_id = auth.uid());

grant select on public.meetups, public.meetup_availability to authenticated;

-- ----------------------------------------------------------------- helpers ---
create or replace function app_private.meetup_pair(p_meetup uuid)
returns table (user_a uuid, user_b uuid, connection_id uuid)
language sql stable security definer set search_path = public as $$
  select c.user_a, c.user_b, c.id
  from public.meetups m
  join public.connections c on c.id = m.connection_id
  where m.id = p_meetup;
$$;

-- Raises unless the caller is one of the two people. Returns the other one.
create or replace function app_private.meetup_other(p_meetup uuid)
returns uuid language plpgsql stable security definer set search_path = public, app_private as $$
declare v_a uuid; v_b uuid;
begin
  select p.user_a, p.user_b into v_a, v_b from app_private.meetup_pair(p_meetup) p;
  if v_a is null or auth.uid() not in (v_a, v_b) then
    raise exception 'That plan is not yours.' using errcode = 'P0001', hint = 'meetup_not_yours';
  end if;
  if app_private.is_blocked(v_a, v_b) then
    raise exception 'That connection is no longer available.' using errcode = 'P0001', hint = 'meetup_blocked';
  end if;
  return case when v_a = auth.uid() then v_b else v_a end;
end $$;

-- ------------------------------------------------------------------- open ----
/** Start (or resume) planning the next meeting with someone you connected with. */
create or replace function public.open_meetup(p_connection_id uuid)
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare v_conn public.connections; v_id uuid;
begin
  select * into v_conn from public.connections where id = p_connection_id;
  if not found or auth.uid() not in (v_conn.user_a, v_conn.user_b) then
    raise exception 'That connection is not yours.' using errcode = 'P0001', hint = 'meetup_not_your_connection';
  end if;
  if app_private.is_blocked(v_conn.user_a, v_conn.user_b) then
    raise exception 'That connection is no longer available.' using errcode = 'P0001', hint = 'meetup_blocked';
  end if;

  select id into v_id from public.meetups
  where connection_id = p_connection_id and status in ('collecting', 'proposed');

  if v_id is null then
    insert into public.meetups (connection_id, opened_by) values (p_connection_id, auth.uid())
    returning id into v_id;
  end if;

  return jsonb_build_object('meetup_id', v_id);
end $$;

-- ----------------------------------------------------------- availability ----
/**
 * Replace my free windows for this plan.
 *   p_slots: [{"day": "2026-11-12", "part": "evening"}, ...]
 * Writing mine never tells me anything about theirs.
 */
create or replace function public.set_my_availability(p_meetup uuid, p_slots jsonb)
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare v_status public.meetup_status; v_saved integer;
begin
  perform app_private.meetup_other(p_meetup);

  select status into v_status from public.meetups where id = p_meetup;
  if v_status <> 'collecting' then
    raise exception 'This plan has moved past picking times.'
      using errcode = 'P0001', hint = 'meetup_not_collecting';
  end if;
  if jsonb_typeof(p_slots) <> 'array' then
    raise exception 'Pick at least one time that works for you.'
      using errcode = 'P0001', hint = 'meetup_slots_invalid';
  end if;

  delete from public.meetup_availability where meetup_id = p_meetup and user_id = auth.uid();

  insert into public.meetup_availability (meetup_id, user_id, day, part)
  select p_meetup, auth.uid(), (s ->> 'day')::date, (s ->> 'part')::public.part_of_day
  from jsonb_array_elements(p_slots) s
  -- Silently drop anything outside the forecast horizon rather than failing the
  -- whole submission: a stale phone screen should not block the plan.
  where (s ->> 'day')::date between current_date and current_date + public.meetup_horizon_days()
  on conflict do nothing;

  select count(*) into v_saved
  from public.meetup_availability where meetup_id = p_meetup and user_id = auth.uid();

  if v_saved = 0 then
    raise exception 'Pick at least one time in the next two weeks.'
      using errcode = 'P0001', hint = 'meetup_slots_empty';
  end if;

  return jsonb_build_object('saved', v_saved);
end $$;

/**
 * The windows you BOTH ticked — and nothing else.
 *
 * Before the other person has answered this returns an empty list and
 * `waiting_on`, never a partial view of their week. That asymmetry is the
 * point: it is the same rule as familiar faces, where a name is not sent and
 * then hidden, it is simply never sent.
 */
create or replace function public.meetup_overlap(p_meetup uuid)
returns jsonb language plpgsql stable security definer set search_path = public, app_private as $$
declare v_them uuid; v_mine integer; v_theirs integer; v_windows jsonb;
begin
  v_them := app_private.meetup_other(p_meetup);

  select count(*) into v_mine
  from public.meetup_availability where meetup_id = p_meetup and user_id = auth.uid() and day >= current_date;
  select count(*) into v_theirs
  from public.meetup_availability where meetup_id = p_meetup and user_id = v_them and day >= current_date;

  if v_mine = 0 then
    return jsonb_build_object('ready', false, 'waiting_on', 'you', 'mine', 0, 'windows', '[]'::jsonb);
  end if;
  if v_theirs = 0 then
    -- Deliberately no count of theirs: "they have started" is still information.
    return jsonb_build_object('ready', false, 'waiting_on', 'them', 'mine', v_mine, 'windows', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('day', s.day, 'part', s.part) order by s.day, s.part), '[]'::jsonb)
    into v_windows
  from (
    select day, part from public.meetup_availability
      where meetup_id = p_meetup and user_id = auth.uid() and day >= current_date
    intersect
    select day, part from public.meetup_availability
      where meetup_id = p_meetup and user_id = v_them and day >= current_date
  ) s;

  return jsonb_build_object(
    'ready', jsonb_array_length(v_windows) > 0,
    'waiting_on', case when jsonb_array_length(v_windows) > 0 then null else 'no_overlap' end,
    'mine', v_mine,
    'windows', v_windows
  );
end $$;

-- ----------------------------------------------------------------- inputs ----
/**
 * Everything the planner is allowed to know, in one call.
 *
 * The API server never reads either user's row directly — it gets this, which
 * is already filtered: the shared overlap (not two full profiles), a first name
 * (already earned through mutual acceptance), and the venue they met at as a
 * starting point for "somewhere between you two".
 */
create or replace function public.meetup_inputs(p_meetup uuid)
returns jsonb language plpgsql stable security definer set search_path = public, app_private as $$
declare v_them uuid; v_a uuid; v_m public.meetups; v_venue jsonb; v_mine jsonb;
begin
  v_them := app_private.meetup_other(p_meetup);
  select p.user_a into v_a from app_private.meetup_pair(p_meetup) p;
  select * into v_m from public.meetups where id = p_meetup;

  -- My own ticks, so reopening the picker shows what I chose last time. Mine
  -- only: theirs are never in this payload, only the intersection is.
  select coalesce(jsonb_agg(jsonb_build_object('day', day, 'part', part) order by day, part), '[]'::jsonb)
    into v_mine
  from public.meetup_availability
  where meetup_id = p_meetup and user_id = auth.uid() and day >= current_date;

  select to_jsonb(x) into v_venue from (
    select v.id, v.name, v.lat, v.lng, v.type, v.is_quiet, v.good_for_groups
    from public.meetups m
    join public.connections c   on c.id = m.connection_id
    join public.conversations cv on cv.id = c.conversation_id
    join public.venues v         on v.id = cv.venue_id
    where m.id = p_meetup
  ) x;

  return jsonb_build_object(
    'meetup_id',        p_meetup,
    'status',           v_m.status,
    'shared',           app_private.shared_between(auth.uid(), v_them),
    'their_first_name', app_private.first_name(v_them),
    'met_at',           v_venue,
    'overlap',          public.meetup_overlap(p_meetup),
    'my_windows',       v_mine,
    'plan',             v_m.plan,
    'i_accepted',       case when v_a = auth.uid() then v_m.a_accepted else v_m.b_accepted end,
    'they_accepted',    case when v_a = auth.uid() then v_m.b_accepted else v_m.a_accepted end,
    'horizon_days',     public.meetup_horizon_days()
  );
end $$;

-- ------------------------------------------------------------------- plan ----
/** Store the itinerary the API built and put it to both people for a yes. */
create or replace function public.record_meetup_plan(p_meetup uuid, p_plan jsonb)
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare v_status public.meetup_status;
begin
  perform app_private.meetup_other(p_meetup);

  select status into v_status from public.meetups where id = p_meetup;
  if v_status not in ('collecting', 'proposed') then
    raise exception 'This plan is already settled.' using errcode = 'P0001', hint = 'meetup_settled';
  end if;
  if not (public.meetup_overlap(p_meetup) ->> 'ready')::boolean then
    raise exception 'You both need to pick some times first.'
      using errcode = 'P0001', hint = 'meetup_no_overlap';
  end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    raise exception 'That is not a plan.' using errcode = 'P0001', hint = 'meetup_plan_invalid';
  end if;

  -- A fresh proposal clears both answers: nobody is held to a yes they gave to
  -- a different plan.
  update public.meetups
     set plan = p_plan, plan_built_at = now(), status = 'proposed',
         a_accepted = false, b_accepted = false, decided_at = null
   where id = p_meetup;

  return jsonb_build_object('status', 'proposed');
end $$;

/** Say yes (or no) to the proposed plan. Confirmed only when both say yes. */
create or replace function public.respond_to_meetup(p_meetup uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare v_a uuid; v_b uuid; v_m public.meetups;
begin
  perform app_private.meetup_other(p_meetup);
  select p.user_a, p.user_b into v_a, v_b from app_private.meetup_pair(p_meetup) p;

  select * into v_m from public.meetups where id = p_meetup for update;
  if v_m.status <> 'proposed' then
    raise exception 'There is no plan to answer yet.' using errcode = 'P0001', hint = 'meetup_not_proposed';
  end if;

  if not p_accept then
    update public.meetups set status = 'declined', decided_at = now(),
           a_accepted = case when v_a = auth.uid() then false else a_accepted end,
           b_accepted = case when v_b = auth.uid() then false else b_accepted end
     where id = p_meetup;
    return jsonb_build_object('status', 'declined');
  end if;

  update public.meetups
     set a_accepted = (a_accepted or v_a = auth.uid()),
         b_accepted = (b_accepted or v_b = auth.uid())
   where id = p_meetup
  returning * into v_m;

  if v_m.a_accepted and v_m.b_accepted then
    update public.meetups set status = 'confirmed', decided_at = now() where id = p_meetup;
    return jsonb_build_object('status', 'confirmed');
  end if;

  return jsonb_build_object('status', 'proposed', 'waiting_on', 'them');
end $$;

/** Back out, or start over with different times. */
create or replace function public.cancel_meetup(p_meetup uuid)
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
begin
  perform app_private.meetup_other(p_meetup);
  update public.meetups set status = 'declined', decided_at = now()
   where id = p_meetup and status in ('collecting', 'proposed');
  return jsonb_build_object('status', 'declined');
end $$;

-- ------------------------------------------------------------------- list ----
create or replace function public.my_meetups()
returns table (
  id uuid, connection_id uuid, their_first_name text, status public.meetup_status,
  plan jsonb, i_accepted boolean, they_accepted boolean, created_at timestamptz
)
language sql stable security definer set search_path = public, app_private as $$
  select m.id,
         m.connection_id,
         app_private.first_name(case when c.user_a = auth.uid() then c.user_b else c.user_a end),
         m.status,
         m.plan,
         case when c.user_a = auth.uid() then m.a_accepted else m.b_accepted end,
         case when c.user_a = auth.uid() then m.b_accepted else m.a_accepted end,
         m.created_at
  from public.meetups m
  join public.connections c on c.id = m.connection_id
  where auth.uid() in (c.user_a, c.user_b)
    and not app_private.is_blocked(c.user_a, c.user_b)
  order by m.created_at desc;
$$;

-- -------------------------------------------------------------------- job ----
/** Retire plans nobody finished, and confirmed plans whose day has passed. */
create or replace function app_private.expire_stale_meetups()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  update public.meetups
     set status = 'expired', decided_at = now()
   where status in ('collecting', 'proposed')
     and created_at < now() - public.meetup_ttl();
  get diagnostics v_count = row_count;

  -- A confirmed plan stops being "upcoming" the day after it happened.
  update public.meetups
     set status = 'expired'
   where status = 'confirmed'
     and (plan ->> 'day')::date < (now() at time zone public.local_tz())::date;

  -- Availability is only useful while the plan is live; drop it once settled.
  delete from public.meetup_availability a
   using public.meetups m
   where m.id = a.meetup_id and m.status in ('confirmed', 'declined', 'expired');

  return v_count;
end $$;

-- ----------------------------------------------------------------- grants ----
do $$
declare f text;
begin
  foreach f in array array[
    'open_meetup(uuid)', 'set_my_availability(uuid, jsonb)', 'meetup_overlap(uuid)',
    'meetup_inputs(uuid)', 'record_meetup_plan(uuid, jsonb)', 'respond_to_meetup(uuid, boolean)',
    'cancel_meetup(uuid)', 'my_meetups()'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

grant execute on function public.meetup_horizon_days() to anon, authenticated;

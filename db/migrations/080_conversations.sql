-- ============================================================================
-- FirstPlace: the conversation layer (PRD: claim, light, request, talk, vote)
-- ============================================================================
-- A table with a box is "claimed" by one person (their check-in at that table)
-- who sets a light: green (talk to anyone), yellow (I choose; requests),
-- red (not now). Someone joins directly on green, or by request on yellow.
-- A conversation then runs (timed on yellow), both phones see shared topics,
-- and afterwards each person privately votes. Only a mutual "good" makes a
-- connection. Nobody ever learns how the other person voted, and a declined
-- request looks exactly like one nobody answered.
--
-- Demo decisions (PRD open questions): green conversations have no timer; one
-- claimant per table; conversations are between two people.

-- ------------------------------------------------------------------ profile --
alter table public.users add column if not exists languages      text[]  not null default '{}';
alter table public.users add column if not exists topics         text[]  not null default '{}';
alter table public.users add column if not exists comm_pref      text;    -- e.g. "type first", "please face me"
alter table public.users add column if not exists share_comm_pref boolean not null default false;
alter table public.users add column if not exists age_range      text check (age_range in ('18-24','25-34','35-44','45-54','55-64','65+'));
alter table public.users add column if not exists id_verified_at timestamptz; -- only "verified", never ID data

-- ----------------------------------------------------------- claims & boxes --
do $$ begin
  create type public.light_color as enum ('green', 'yellow', 'red');
exception when duplicate_object then null; end $$;

-- The claimant's chosen light. Yellow is the default when claiming.
alter table public.checkins add column if not exists light public.light_color not null default 'yellow';
-- "I'll be right back": the claim survives this long while away from the table.
alter table public.checkins add column if not exists away_until timestamptz;

-- The privacy base views select c.*, which Postgres freezes at creation time.
-- Recreate them so they carry the new columns (same filters as 030).
create or replace view app_private.active_checkins as
  select c.* from public.checkins c join public.users u on u.id = c.user_id
  where c.checked_out_at is null and c.checked_in_at > now() - public.session_length() and u.incognito = false;
create or replace view app_private.countable_checkins as
  select c.* from public.checkins c join public.users u on u.id = c.user_id
  where u.incognito = false;
revoke all on app_private.active_checkins, app_private.countable_checkins from anon, authenticated;

-- Owner controls per box (the box IS the table's box).
alter table public.tables add column if not exists box_enabled boolean not null default true;

-- Boxes are dark from 22:00 to 06:00 Calgary time (PRD: off at 10pm).
-- app_private.settings 'box_hours' = 'ignore' lifts this for overnight
-- hackathon testing; set it back to 'enforce' before judging.
create table if not exists app_private.settings (key text primary key, value text not null);
insert into app_private.settings (key, value) values ('box_hours', 'enforce') on conflict do nothing;

create or replace function public.boxes_open_now()
returns boolean language sql stable security definer set search_path = public, app_private as $$
  select coalesce((select value = 'ignore' from app_private.settings where key = 'box_hours'), false)
      or extract(hour from now() at time zone public.local_tz()) between 6 and 21;
$$;

-- ---------------------------------------------------------------- requests --
do $$ begin
  create type public.request_status as enum ('pending', 'accepted', 'declined', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.chat_requests (
  id            uuid primary key default gen_random_uuid(),
  table_id      uuid not null references public.tables (id) on delete cascade,
  from_user     uuid not null references public.users (id) on delete cascade,
  to_user       uuid not null references public.users (id) on delete cascade,
  status        public.request_status not null default 'pending',
  created_at    timestamptz not null default now(),
  responded_at  timestamptz
);
create index if not exists chat_requests_to_idx   on public.chat_requests (to_user, status, created_at desc);
create index if not exists chat_requests_from_idx on public.chat_requests (from_user, created_at desc);

-- A pending request is only live for 2 minutes. After that it is treated as
-- unanswered, which looks identical to a decline.
create or replace function public.request_ttl() returns interval language sql immutable as $$ select interval '2 minutes' $$;

-- ----------------------------------------------------------- conversations --
do $$ begin
  create type public.vote as enum ('good', 'not_for_me');
exception when duplicate_object then null; end $$;

create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  table_id    uuid not null references public.tables (id) on delete cascade,
  venue_id    uuid not null references public.venues (id) on delete cascade,
  seated_user uuid not null references public.users (id) on delete cascade,
  joiner_user uuid not null references public.users (id) on delete cascade,
  via         text not null check (via in ('green', 'request')),
  started_at  timestamptz not null default now(),
  ends_at     timestamptz,           -- null = untimed (green)
  ended_at    timestamptz,
  seated_extend boolean,
  joiner_extend boolean,
  seated_vote public.vote,
  joiner_vote public.vote
);
create index if not exists conversations_table_idx on public.conversations (table_id) where ended_at is null;
create index if not exists conversations_users_idx on public.conversations (seated_user, joiner_user);
-- One live conversation per person.
create unique index if not exists conversations_one_live_seated on public.conversations (seated_user) where ended_at is null;
create unique index if not exists conversations_one_live_joiner on public.conversations (joiner_user) where ended_at is null;

-- -------------------------------------------------------------- connections --
create table if not exists public.connections (
  id              uuid primary key default gen_random_uuid(),
  user_a          uuid not null references public.users (id) on delete cascade,
  user_b          uuid not null references public.users (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint connections_ordered check (user_a < user_b),
  unique (user_a, user_b)
);

-- --------------------------------------------------------- safety: reports --
create table if not exists public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter        uuid not null references public.users (id) on delete cascade,
  reported        uuid not null references public.users (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  reason          text not null check (reason in ('uncomfortable','would_not_leave','inappropriate','romantic_unwanted','other')),
  note            text,
  status          text not null default 'open' check (status in ('open','reviewed','actioned')),
  created_at      timestamptz not null default now()
);

create table if not exists public.blocks (
  blocker    uuid not null references public.users (id) on delete cascade,
  blocked    uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);

create or replace function app_private.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a));
$$;

-- ---------------------------------------------------------------- RLS ------
alter table public.chat_requests enable row level security;
alter table public.conversations enable row level security;
alter table public.connections   enable row level security;
alter table public.reports       enable row level security;
alter table public.blocks        enable row level security;

-- Reads only. Every write goes through the functions below.
drop policy if exists chat_requests_own on public.chat_requests;
create policy chat_requests_own on public.chat_requests for select to authenticated
  using (auth.uid() in (from_user, to_user));
drop policy if exists conversations_own on public.conversations;
create policy conversations_own on public.conversations for select to authenticated
  using (auth.uid() in (seated_user, joiner_user));
drop policy if exists connections_own on public.connections;
create policy connections_own on public.connections for select to authenticated
  using (auth.uid() in (user_a, user_b));
drop policy if exists reports_own on public.reports;
create policy reports_own on public.reports for select to authenticated
  using (reporter = auth.uid());
drop policy if exists blocks_own on public.blocks;
create policy blocks_own on public.blocks for select to authenticated
  using (blocker = auth.uid());

grant select on public.chat_requests, public.conversations, public.connections, public.reports, public.blocks to authenticated;

-- ------------------------------------------------------------ helpers ------
-- The live claim at a table (null when nobody claims it, or they're incognito).
create or replace function app_private.table_claim(p_table uuid)
returns public.checkins language sql stable security definer set search_path = public, app_private as $$
  select c.* from app_private.active_checkins c
  where c.table_id = p_table
  order by c.checked_in_at desc limit 1;
$$;

-- What the shared-topics card is built from: the overlap only, never a full list.
create or replace function app_private.shared_between(a uuid, b uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'interests', coalesce((select jsonb_agg(x) from (select unnest(ua.interests) intersect select unnest(ub.interests) limit 3) s(x)), '[]'::jsonb),
    'topics',    coalesce((select jsonb_agg(x) from (select unnest(ua.topics)    intersect select unnest(ub.topics)    limit 5) s(x)), '[]'::jsonb),
    'languages', coalesce((select jsonb_agg(x) from (select unnest(ua.languages) intersect select unnest(ub.languages)) s(x)), '[]'::jsonb)
  )
  from public.users ua, public.users ub where ua.id = a and ub.id = b;
$$;

create or replace function app_private.first_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select nullif(split_part(trim(name), ' ', 1), '') from public.users where id = p_user;
$$;

-- The colour a box shows. FAIL CLOSED: anything unclear is 'off'.
create or replace function public.table_light(p_table uuid)
returns text language plpgsql stable security definer set search_path = public, app_private as $$
declare
  v_enabled boolean;
  v_claim   public.checkins;
begin
  select box_enabled into v_enabled from public.tables where id = p_table;
  if not found or not v_enabled or not public.boxes_open_now() then return 'off'; end if;

  v_claim := app_private.table_claim(p_table);
  if v_claim.id is null then return 'off'; end if;

  -- In a conversation at this table: red, so nobody else tries to join.
  if exists (select 1 from public.conversations where table_id = p_table and ended_at is null) then
    return 'red';
  end if;
  return v_claim.light::text;
end $$;

-- ------------------------------------------------------------- claim -------
-- Tap the box (NFC tag / QR on the box) to claim its table. Replaces any
-- previous claim. Demo limitation (PRD): plain NFC tags can be copied.
create or replace function public.claim_table(p_table_id uuid, p_light public.light_color default 'yellow')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user  uuid := auth.uid();
  v_venue uuid;
  v_enabled boolean;
  v_row   public.checkins;
begin
  if v_user is null then raise exception 'Please sign in first.'; end if;
  select venue_id, box_enabled into v_venue, v_enabled from public.tables where id = p_table_id for update;
  if not found then raise exception 'That table isn''t a conversation zone.' using hint = 'table_not_found'; end if;
  if not v_enabled or not public.boxes_open_now() then
    raise exception 'This table isn''t a conversation zone right now.' using hint = 'box_off';
  end if;
  if (app_private.table_claim(p_table_id)).user_id is distinct from null
     and (app_private.table_claim(p_table_id)).user_id <> v_user then
    raise exception 'Someone is already here. Try the nearest free table.' using hint = 'table_taken';
  end if;

  -- Close any other session (one place at a time), freeing its table.
  with closed as (
    update public.checkins set checked_out_at = now()
    where user_id = v_user and checked_out_at is null and table_id is distinct from p_table_id
    returning table_id)
  update public.tables set status = 'open' where id in (select table_id from closed where table_id is not null);

  select * into v_row from public.checkins where user_id = v_user and checked_out_at is null;
  if found then
    update public.checkins set light = p_light, open_to_chat = (p_light <> 'red'), away_until = null
    where id = v_row.id returning * into v_row;
  else
    insert into public.checkins (user_id, venue_id, table_id, open_to_chat, light)
    values (v_user, v_venue, p_table_id, p_light <> 'red', p_light) returning * into v_row;
  end if;
  update public.tables set status = 'taken' where id = p_table_id;

  return jsonb_build_object('checkin_id', v_row.id, 'table_id', p_table_id, 'venue_id', v_venue, 'light', v_row.light);
end $$;

create or replace function public.set_light(p_light public.light_color)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.checkins;
begin
  update public.checkins set light = p_light, open_to_chat = (p_light <> 'red')
  where user_id = auth.uid() and checked_out_at is null returning * into v_row;
  if not found then raise exception 'You haven''t claimed a table.' using hint = 'no_claim'; end if;
  return jsonb_build_object('light', v_row.light);
end $$;

-- "I'll be right back": keeps the claim for 5 minutes.
create or replace function public.step_away()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_until timestamptz := now() + interval '5 minutes';
begin
  update public.checkins set away_until = v_until where user_id = auth.uid() and checked_out_at is null;
  if not found then raise exception 'You haven''t claimed a table.' using hint = 'no_claim'; end if;
  return jsonb_build_object('away_until', v_until);
end $$;

-- ------------------------------------------------------- start: on green ---
create or replace function public.join_green(p_table_id uuid)
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare
  v_user  uuid := auth.uid();
  v_claim public.checkins;
  v_conv  public.conversations;
begin
  if v_user is null then raise exception 'Please sign in first.'; end if;
  v_claim := app_private.table_claim(p_table_id);
  if v_claim.id is null or v_claim.user_id = v_user or public.table_light(p_table_id) <> 'green'
     or app_private.is_blocked(v_user, v_claim.user_id) then
    -- Same message for every reason: never reveal why.
    raise exception 'Not available right now.' using hint = 'not_available';
  end if;
  insert into public.conversations (table_id, venue_id, seated_user, joiner_user, via)
  values (p_table_id, v_claim.venue_id, v_claim.user_id, v_user, 'green') returning * into v_conv;
  return jsonb_build_object('conversation_id', v_conv.id);
end $$;

-- ------------------------------------------------------ start: on yellow ---
create or replace function public.request_chat(p_table_id uuid)
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare
  v_user  uuid := auth.uid();
  v_claim public.checkins;
  v_req   public.chat_requests;
begin
  if v_user is null then raise exception 'Please sign in first.'; end if;
  v_claim := app_private.table_claim(p_table_id);

  if v_claim.id is null or v_claim.user_id = v_user or public.table_light(p_table_id) <> 'yellow'
     or app_private.is_blocked(v_user, v_claim.user_id)
     -- 24h cooldown after a decline (silent: looks like any other "not available")
     or exists (select 1 from public.chat_requests
                where from_user = v_user and to_user = v_claim.user_id
                  and status = 'declined' and responded_at > now() - interval '24 hours') then
    raise exception 'Not available right now.' using hint = 'not_available';
  end if;

  insert into public.chat_requests (table_id, from_user, to_user)
  values (p_table_id, v_user, v_claim.user_id) returning * into v_req;
  return jsonb_build_object('request_id', v_req.id, 'expires_at', v_req.created_at + public.request_ttl());
end $$;

-- What the requester sees: pending, accepted (+ conversation), or not_available.
-- Declined and unanswered are deliberately indistinguishable.
create or replace function public.my_request_status(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_req public.chat_requests; v_conv uuid;
begin
  select * into v_req from public.chat_requests where id = p_request_id and from_user = auth.uid();
  if not found then raise exception 'No such request.' using hint = 'request_not_found'; end if;
  if v_req.status = 'accepted' then
    select id into v_conv from public.conversations
    where joiner_user = v_req.from_user and seated_user = v_req.to_user and started_at >= v_req.responded_at - interval '5 seconds'
    order by started_at desc limit 1;
    return jsonb_build_object('status', 'accepted', 'conversation_id', v_conv);
  end if;
  if v_req.status = 'pending' and v_req.created_at > now() - public.request_ttl() then
    return jsonb_build_object('status', 'pending');
  end if;
  return jsonb_build_object('status', 'not_available');
end $$;

-- The seated person's request cards: first name, verified badge, the overlap
-- of interests/topics/languages, and a communication preference if shared.
create or replace function public.my_incoming_requests()
returns table (id uuid, first_name text, age_range text, verified boolean, shared jsonb,
               comm_pref text, expires_at timestamptz)
language sql stable security definer set search_path = public, app_private as $$
  select r.id, app_private.first_name(r.from_user), u.age_range, u.id_verified_at is not null,
         app_private.shared_between(r.to_user, r.from_user),
         case when u.share_comm_pref then u.comm_pref end,
         r.created_at + public.request_ttl()
  from public.chat_requests r join public.users u on u.id = r.from_user
  where r.to_user = auth.uid() and r.status = 'pending' and r.created_at > now() - public.request_ttl()
    and not app_private.is_blocked(r.from_user, r.to_user)
  order by r.created_at;
$$;

create or replace function public.respond_to_request(p_request_id uuid, p_accept boolean, p_minutes integer default 30)
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare
  v_user uuid := auth.uid();
  v_req  public.chat_requests;
  v_conv public.conversations;
  v_venue uuid;
begin
  select * into v_req from public.chat_requests where id = p_request_id and to_user = v_user for update;
  if not found or v_req.status <> 'pending' or v_req.created_at <= now() - public.request_ttl() then
    raise exception 'That request has expired.' using hint = 'request_expired';
  end if;

  if not p_accept then
    update public.chat_requests set status = 'declined', responded_at = now() where id = v_req.id;
    return jsonb_build_object('accepted', false);
  end if;

  if p_minutes not in (15, 30, 45) then raise exception 'Pick 15, 30 or 45 minutes.'; end if;
  update public.chat_requests set status = 'accepted', responded_at = now() where id = v_req.id;
  -- Any other pending requests to this person quietly lapse.
  update public.chat_requests set status = 'cancelled', responded_at = now()
  where to_user = v_user and status = 'pending' and id <> v_req.id;

  select venue_id into v_venue from public.tables where id = v_req.table_id;
  insert into public.conversations (table_id, venue_id, seated_user, joiner_user, via, ends_at)
  values (v_req.table_id, v_venue, v_user, v_req.from_user, 'request', now() + make_interval(mins => p_minutes))
  returning * into v_conv;
  return jsonb_build_object('accepted', true, 'conversation_id', v_conv.id, 'ends_at', v_conv.ends_at);
end $$;

-- ------------------------------------------------------- the conversation --
-- Everything one participant may see: the other's first name, the shared
-- overlap, the timer, and (after it ends) whether a connection was made.
create or replace function public.my_conversation(p_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, app_private as $$
declare
  v_user uuid := auth.uid();
  v_conv public.conversations;
  v_other uuid;
  v_me_seated boolean;
begin
  -- No id: the live conversation, or else one that just ended and still needs
  -- my private vote (so it isn't lost when the OTHER person ends it).
  select * into v_conv from public.conversations cv
  where auth.uid() in (cv.seated_user, cv.joiner_user)
    and (
      (p_id is null and (
         cv.ended_at is null
         or (cv.ended_at > now() - interval '15 minutes'
             and (case when cv.seated_user = auth.uid() then cv.seated_vote else cv.joiner_vote end) is null)))
      or cv.id = p_id)
  order by (cv.ended_at is null) desc, cv.started_at desc limit 1;
  if not found then return null; end if;

  v_me_seated := v_conv.seated_user = v_user;
  v_other := case when v_me_seated then v_conv.joiner_user else v_conv.seated_user end;

  return jsonb_build_object(
    'id', v_conv.id,
    'via', v_conv.via,
    'started_at', v_conv.started_at,
    'ends_at', v_conv.ends_at,
    'ended_at', v_conv.ended_at,
    'their_first_name', app_private.first_name(v_other),
    'shared', app_private.shared_between(v_user, v_other),
    'my_vote', case when v_me_seated then v_conv.seated_vote else v_conv.joiner_vote end,
    'my_extend', case when v_me_seated then v_conv.seated_extend else v_conv.joiner_extend end,
    -- Only ever the outcome both chose; never the other person's individual vote.
    'connected', exists (select 1 from public.connections where conversation_id = v_conv.id)
  );
end $$;

create or replace function public.end_conversation()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update public.conversations set ended_at = now()
  where auth.uid() in (seated_user, joiner_user) and ended_at is null returning id into v_id;
  return jsonb_build_object('ended', v_id is not null, 'conversation_id', v_id);
end $$;

-- At the timer: continue only if BOTH choose extend (+15 minutes).
create or replace function public.vote_extend(p_extend boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_conv public.conversations;
begin
  update public.conversations set
    seated_extend = case when seated_user = auth.uid() then p_extend else seated_extend end,
    joiner_extend = case when joiner_user = auth.uid() then p_extend else joiner_extend end
  where auth.uid() in (seated_user, joiner_user) and ended_at is null returning * into v_conv;
  if not found then raise exception 'No conversation in progress.' using hint = 'no_conversation'; end if;

  if v_conv.seated_extend is false or v_conv.joiner_extend is false then
    update public.conversations set ended_at = now() where id = v_conv.id;
    return jsonb_build_object('status', 'wrapped_up');
  elsif v_conv.seated_extend and v_conv.joiner_extend then
    update public.conversations set ends_at = greatest(coalesce(ends_at, now()), now()) + interval '15 minutes',
                                    seated_extend = null, joiner_extend = null
    where id = v_conv.id;
    return jsonb_build_object('status', 'extended');
  end if;
  return jsonb_build_object('status', 'waiting');
end $$;

-- The private vote. A connection exists only if both say good; the response
-- never says how the other person voted.
create or replace function public.vote_conversation(p_conversation_id uuid, p_vote public.vote)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_conv public.conversations;
begin
  update public.conversations set
    seated_vote = case when seated_user = auth.uid() then p_vote else seated_vote end,
    joiner_vote = case when joiner_user = auth.uid() then p_vote else joiner_vote end,
    ended_at = coalesce(ended_at, now())
  where id = p_conversation_id and auth.uid() in (seated_user, joiner_user)
  returning * into v_conv;
  if not found then raise exception 'No such conversation.' using hint = 'no_conversation'; end if;

  if v_conv.seated_vote = 'good' and v_conv.joiner_vote = 'good' then
    insert into public.connections (user_a, user_b, conversation_id)
    values (least(v_conv.seated_user, v_conv.joiner_user), greatest(v_conv.seated_user, v_conv.joiner_user), v_conv.id)
    on conflict (user_a, user_b) do update set conversation_id = excluded.conversation_id;
  end if;
  return jsonb_build_object('recorded', true);
end $$;

create or replace function public.my_connections()
returns table (id uuid, first_name text, shared jsonb, created_at timestamptz, venue_name text)
language sql stable security definer set search_path = public, app_private as $$
  select c.id,
         app_private.first_name(case when c.user_a = auth.uid() then c.user_b else c.user_a end),
         app_private.shared_between(c.user_a, c.user_b),
         c.created_at,
         v.name
  from public.connections c
  left join public.conversations cv on cv.id = c.conversation_id
  left join public.venues v on v.id = cv.venue_id
  where auth.uid() in (c.user_a, c.user_b)
    and not app_private.is_blocked(c.user_a, c.user_b)
  order by c.created_at desc;
$$;

-- -------------------------------------------------------------- safety -----
-- Report (optionally about a conversation). Immediately: the reporter's light
-- turns red, any live conversation between them ends, and they're blocked.
create or replace function public.report_user(p_conversation_id uuid, p_reason text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_conv public.conversations; v_other uuid;
begin
  select * into v_conv from public.conversations
  where id = p_conversation_id and v_user in (seated_user, joiner_user);
  if not found then raise exception 'No such conversation.' using hint = 'no_conversation'; end if;
  v_other := case when v_conv.seated_user = v_user then v_conv.joiner_user else v_conv.seated_user end;

  insert into public.reports (reporter, reported, conversation_id, reason, note)
  values (v_user, v_other, v_conv.id, p_reason, left(p_note, 1000));
  insert into public.blocks (blocker, blocked) values (v_user, v_other) on conflict do nothing;
  update public.conversations set ended_at = now() where id = v_conv.id and ended_at is null;
  update public.checkins set light = 'red', open_to_chat = false where user_id = v_user and checked_out_at is null;
  return jsonb_build_object('reported', true);
end $$;

create or replace function public.block_from_conversation(p_conversation_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_conv public.conversations;
begin
  select * into v_conv from public.conversations where id = p_conversation_id and v_user in (seated_user, joiner_user);
  if not found then raise exception 'No such conversation.' using hint = 'no_conversation'; end if;
  insert into public.blocks (blocker, blocked)
  values (v_user, case when v_conv.seated_user = v_user then v_conv.joiner_user else v_conv.seated_user end)
  on conflict do nothing;
  return jsonb_build_object('blocked', true);
end $$;

-- Help → "Leave now": check out, light off, end any conversation. No reason given.
create or replace function public.leave_now()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  update public.conversations set ended_at = now() where v_user in (seated_user, joiner_user) and ended_at is null;
  update public.chat_requests set status = 'cancelled', responded_at = now()
  where (from_user = v_user or to_user = v_user) and status = 'pending';
  with closed as (
    update public.checkins set checked_out_at = now() where user_id = v_user and checked_out_at is null returning table_id)
  update public.tables set status = 'open' where id in (select table_id from closed where table_id is not null);
  return jsonb_build_object('left', true);
end $$;

-- 22:00 shutoff job: end conversations and check everyone out at boxes.
create or replace function app_private.close_boxes_for_night()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if public.boxes_open_now() then return 0; end if;
  update public.conversations set ended_at = now() where ended_at is null;
  with closed as (
    update public.checkins set checked_out_at = now()
    where checked_out_at is null and table_id is not null returning table_id)
  update public.tables set status = 'open' where id in (select table_id from closed);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Live counts on the map: "people open to talk" = claims on green or yellow.
-- (venue_live.people_open_to_chat already counts open_to_chat, which claims keep in sync.)

-- ------------------------------------------------------------- grants ------
do $$
declare f text;
begin
  foreach f in array array[
    'claim_table(uuid, public.light_color)', 'set_light(public.light_color)', 'step_away()',
    'join_green(uuid)', 'request_chat(uuid)', 'my_request_status(uuid)', 'my_incoming_requests()',
    'respond_to_request(uuid, boolean, integer)', 'my_conversation(uuid)', 'end_conversation()',
    'vote_extend(boolean)', 'vote_conversation(uuid, public.vote)', 'my_connections()',
    'report_user(uuid, text, text)', 'block_from_conversation(uuid)', 'leave_now()'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
grant execute on function public.table_light(uuid) to anon, authenticated;
grant execute on function public.boxes_open_now() to anon, authenticated;

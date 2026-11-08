-- ============================================================================
-- CHATTERBOX: group conversations and what happens when one ends
-- ============================================================================
-- Builds on 080. Changes:
--
--  * Groups. A conversation has any number of members (conversation_members).
--    Phones refer to people by a per-conversation member id, never a user id.
--    The table keeps the host's light while people talk: green lets more
--    people join, yellow takes requests to the host, red closes the group.
--  * Ending. An untimed conversation ends once at least half of the people
--    still in it tap End. Anyone can also just leave.
--  * Full reset. When a conversation ends, everyone at that table is checked
--    out, the table is freed and the box goes off. The conversation row (with
--    end_reason) is the history log.
--  * Three outcomes, per pair of people:
--      hit it off  both vote good -> connection; they can swap socials and
--                  get a Calgary hangout plan (server, rag.ts / itinerary.ts)
--      one-sided   whoever said good may ask ONCE to swap socials. Nobody
--                  learns anyone's vote; a decline looks like no answer and
--                  can't be asked again.
--      unsafe      anonymous report against a member: flags their profile for
--                  moderator review, blocks them, and takes the reporter out.
--
-- Idempotent like every migration here (db-setup re-runs them all).

-- --------------------------------------------------------------- profile ---
-- Private: users can only read their own row (020_rls). Shown to someone else
-- only through my_contacts() after an accepted swap.
alter table public.users add column if not exists socials jsonb not null default '{}'::jsonb;
alter table public.users drop constraint if exists users_socials_object;
alter table public.users add constraint users_socials_object check (jsonb_typeof(socials) = 'object');
-- Set when someone reports this person. Cleared by a moderator after review.
alter table public.users add column if not exists flagged_at timestamptz;

-- ---------------------------------------------------------- conversations ---
alter table public.conversations alter column joiner_user drop not null;
alter table public.conversations add column if not exists end_reason text;
alter table public.conversations drop constraint if exists conversations_end_reason;
alter table public.conversations add constraint conversations_end_reason
  check (end_reason is null or end_reason in ('ended', 'timer', 'everyone_left', 'reported', 'nightly'));
-- Members (below) now enforce "one live conversation per person".
drop index if exists public.conversations_one_live_seated;
drop index if exists public.conversations_one_live_joiner;

create table if not exists public.conversation_members (
  id              uuid primary key default gen_random_uuid(),   -- the member id phones see
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.users (id) on delete cascade,
  joined_at       timestamptz not null default now(),
  left_at         timestamptz,
  live            boolean not null default true,   -- in a running conversation right now
  wants_end       boolean not null default false,
  extend          boolean,
  unique (conversation_id, user_id)
);
create index if not exists conversation_members_user_idx on public.conversation_members (user_id);
create unique index if not exists conversation_members_one_live on public.conversation_members (user_id) where live;

-- Existing 1-on-1 conversations become two-member groups.
insert into public.conversation_members (conversation_id, user_id, joined_at, live)
select c.id, u.user_id, c.started_at, c.ended_at is null
from public.conversations c
cross join lateral (values (c.seated_user), (c.joiner_user)) as u(user_id)
where u.user_id is not null
on conflict (conversation_id, user_id) do nothing;

-- Private votes, one per (voter, person) per conversation. Never readable by
-- anyone: only the functions below look at them.
create table if not exists public.pair_votes (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  voter           uuid not null references public.users (id) on delete cascade,
  about           uuid not null references public.users (id) on delete cascade,
  vote            public.vote not null,
  created_at      timestamptz not null default now(),
  primary key (conversation_id, voter, about),
  check (voter <> about)
);
-- Carry over 080's single votes.
insert into public.pair_votes (conversation_id, voter, about, vote)
select id, seated_user, joiner_user, seated_vote from public.conversations
where seated_vote is not null and joiner_user is not null
on conflict do nothing;
insert into public.pair_votes (conversation_id, voter, about, vote)
select id, joiner_user, seated_user, joiner_vote from public.conversations
where joiner_vote is not null and joiner_user is not null
on conflict do nothing;

-- One swap per pair, ever. A decline is final and never shown to the asker.
create table if not exists public.social_exchanges (
  id              uuid primary key default gen_random_uuid(),
  user_a          uuid not null references public.users (id) on delete cascade,
  user_b          uuid not null references public.users (id) on delete cascade,
  requested_by    uuid not null references public.users (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  status          text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at      timestamptz not null default now(),
  responded_at    timestamptz,
  constraint social_exchanges_ordered check (user_a < user_b),
  unique (user_a, user_b)
);

alter table public.conversation_members enable row level security;
alter table public.pair_votes           enable row level security;
alter table public.social_exchanges     enable row level security;
-- No policies and no grants on these three: functions only.
revoke all on public.conversation_members, public.pair_votes, public.social_exchanges from anon, authenticated;

-- A conversation is visible to anyone who was ever a member of it.
drop policy if exists conversations_own on public.conversations;
create policy conversations_own on public.conversations for select to authenticated
  using (exists (select 1 from public.conversation_members m
                 where m.conversation_id = conversations.id and m.user_id = auth.uid()));

-- ------------------------------------------------------------- helpers -----
create or replace function app_private.live_conversation_at(p_table uuid)
returns public.conversations language sql stable security definer set search_path = public as $$
  select * from public.conversations where table_id = p_table and ended_at is null
  order by started_at desc limit 1;
$$;

create or replace function app_private.my_live_member()
returns public.conversation_members language sql stable security definer set search_path = public as $$
  select * from public.conversation_members where user_id = auth.uid() and live;
$$;

-- Blocked with anyone still in this conversation?
create or replace function app_private.blocked_in(p_conv uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public, app_private as $$
  select exists (select 1 from public.conversation_members m
                 where m.conversation_id = p_conv and m.live and app_private.is_blocked(m.user_id, p_user));
$$;

-- What a group has in common: anything at least two current members listed.
-- For two people that is exactly their overlap. Never says who listed what.
create or replace function app_private.group_shared(p_conv uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with m as (
    select u.* from public.conversation_members cm join public.users u on u.id = cm.user_id
    where cm.conversation_id = p_conv and cm.left_at is null
  ),
  pick as (
    select 'interests' as k, x from m, unnest(m.interests) x
    union all select 'topics', x from m, unnest(m.topics) x
    union all select 'languages', x from m, unnest(m.languages) x
  ),
  common as (select k, x from pick group by k, x having count(*) >= 2)
  select jsonb_build_object(
    'interests', coalesce((select jsonb_agg(x) from (select x from common where k = 'interests' order by x limit 3) s), '[]'::jsonb),
    'topics',    coalesce((select jsonb_agg(x) from (select x from common where k = 'topics' order by x limit 5) s), '[]'::jsonb),
    'languages', coalesce((select jsonb_agg(x) from (select x from common where k = 'languages' order by x) s), '[]'::jsonb)
  );
$$;

-- End a conversation and fully reset its table: everyone there is checked
-- out, the table is free, the box goes off, pending requests lapse.
create or replace function app_private.finish_conversation(p_conv uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_table uuid;
begin
  update public.conversations set ended_at = now(), end_reason = p_reason
  where id = p_conv and ended_at is null returning table_id into v_table;
  if v_table is null then return; end if;
  update public.conversation_members set live = false, wants_end = false, extend = null
  where conversation_id = p_conv and live;
  update public.checkins set checked_out_at = now() where table_id = v_table and checked_out_at is null;
  update public.tables set status = 'open' where id = v_table;
  update public.chat_requests set status = 'cancelled', responded_at = now()
  where table_id = v_table and status = 'pending';
end $$;

-- One person leaves. Fewer than two left means the conversation is over.
create or replace function app_private.leave_conversation(p_user uuid, p_reason text default 'everyone_left')
returns uuid language plpgsql security definer set search_path = public, app_private as $$
declare v_m public.conversation_members; v_conv public.conversations;
begin
  select * into v_m from public.conversation_members where user_id = p_user and live;
  if not found then return null; end if;
  select * into v_conv from public.conversations where id = v_m.conversation_id;
  update public.conversation_members set live = false, left_at = now(), wants_end = false, extend = null
  where id = v_m.id;
  -- Leaving the conversation means leaving that table.
  update public.checkins set checked_out_at = now()
  where user_id = p_user and table_id = v_conv.table_id and checked_out_at is null;
  if (select count(*) from public.conversation_members where conversation_id = v_conv.id and live) < 2 then
    perform app_private.finish_conversation(v_conv.id, p_reason);
  else
    perform app_private.maybe_end(v_conv.id);
  end if;
  return v_conv.id;
end $$;

-- At least half of the people still here want to end it?
create or replace function app_private.maybe_end(p_conv uuid)
returns boolean language plpgsql security definer set search_path = public, app_private as $$
declare v_n integer; v_want integer;
begin
  select count(*), count(*) filter (where wants_end) into v_n, v_want
  from public.conversation_members where conversation_id = p_conv and live;
  if v_n > 0 and v_want * 2 >= v_n then
    perform app_private.finish_conversation(p_conv, 'ended');
    return true;
  end if;
  return false;
end $$;

create or replace function app_private.add_member(p_conv uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.conversation_members where user_id = p_user and live) then
    raise exception 'Finish your current conversation first.' using hint = 'already_in_conversation';
  end if;
  insert into public.conversation_members (conversation_id, user_id) values (p_conv, p_user)
  on conflict (conversation_id, user_id) do update set live = true, left_at = null, wants_end = false, extend = null;
end $$;

-- ------------------------------------------------------------ the light ----
-- FAIL CLOSED: anything unclear is 'off'. While people talk the box keeps the
-- host's light, so a green group can grow. If the host has left but others
-- are still talking, it shows red: nobody new can join a group with no host.
create or replace function public.table_light(p_table uuid)
returns text language plpgsql stable security definer set search_path = public, app_private as $$
declare
  v_enabled boolean;
  v_claim   public.checkins;
begin
  select box_enabled into v_enabled from public.tables where id = p_table;
  if not found or not v_enabled or not public.boxes_open_now() then return 'off'; end if;
  v_claim := app_private.table_claim(p_table);
  if v_claim.id is null then
    return case when (app_private.live_conversation_at(p_table)).id is not null then 'red' else 'off' end;
  end if;
  return v_claim.light::text;
end $$;

-- ------------------------------------------------------------ joining ------
create or replace function public.join_green(p_table_id uuid)
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare
  v_user  uuid := auth.uid();
  v_claim public.checkins;
  v_conv  public.conversations;
begin
  if v_user is null then raise exception 'Please sign in first.'; end if;
  v_claim := app_private.table_claim(p_table_id);
  v_conv := app_private.live_conversation_at(p_table_id);
  if v_claim.id is null or v_claim.user_id = v_user or public.table_light(p_table_id) <> 'green'
     or app_private.is_blocked(v_user, v_claim.user_id)
     or (v_conv.id is not null and (app_private.blocked_in(v_conv.id, v_user)
         or exists (select 1 from public.conversation_members where conversation_id = v_conv.id and user_id = v_user and live))) then
    -- Same message for every reason: never reveal why.
    raise exception 'Not available right now.' using hint = 'not_available';
  end if;

  if v_conv.id is null then
    insert into public.conversations (table_id, venue_id, seated_user, joiner_user, via)
    values (p_table_id, v_claim.venue_id, v_claim.user_id, v_user, 'green') returning * into v_conv;
    perform app_private.add_member(v_conv.id, v_claim.user_id);
  end if;
  perform app_private.add_member(v_conv.id, v_user);
  return jsonb_build_object('conversation_id', v_conv.id);
end $$;

create or replace function public.request_chat(p_table_id uuid)
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare
  v_user  uuid := auth.uid();
  v_claim public.checkins;
  v_conv  public.conversations;
  v_req   public.chat_requests;
begin
  if v_user is null then raise exception 'Please sign in first.'; end if;
  v_claim := app_private.table_claim(p_table_id);
  v_conv := app_private.live_conversation_at(p_table_id);

  if v_claim.id is null or v_claim.user_id = v_user or public.table_light(p_table_id) <> 'yellow'
     or app_private.is_blocked(v_user, v_claim.user_id)
     or (v_conv.id is not null and app_private.blocked_in(v_conv.id, v_user))
     or exists (select 1 from public.conversation_members where user_id = v_user and live)
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

create or replace function public.my_request_status(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_req public.chat_requests; v_conv uuid;
begin
  select * into v_req from public.chat_requests where id = p_request_id and from_user = auth.uid();
  if not found then raise exception 'No such request.' using hint = 'request_not_found'; end if;
  if v_req.status = 'accepted' then
    select m.conversation_id into v_conv from public.conversation_members m
    join public.conversations c on c.id = m.conversation_id
    where m.user_id = v_req.from_user and c.table_id = v_req.table_id and m.joined_at >= v_req.responded_at - interval '5 seconds'
    order by m.joined_at desc limit 1;
    return jsonb_build_object('status', 'accepted', 'conversation_id', v_conv);
  end if;
  if v_req.status = 'pending' and v_req.created_at > now() - public.request_ttl() then
    return jsonb_build_object('status', 'pending');
  end if;
  return jsonb_build_object('status', 'not_available');
end $$;

-- The host accepts: the requester joins the conversation at the table, or a
-- new timed one starts. Other pending requests stay open (groups can grow).
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
  if exists (select 1 from public.conversation_members where user_id = v_req.from_user and live) then
    update public.chat_requests set status = 'cancelled', responded_at = now() where id = v_req.id;
    raise exception 'They have started another conversation.' using hint = 'request_expired';
  end if;

  v_conv := app_private.live_conversation_at(v_req.table_id);
  if v_conv.id is null then
    if p_minutes not in (15, 30, 45) then raise exception 'Pick 15, 30 or 45 minutes.'; end if;
    select venue_id into v_venue from public.tables where id = v_req.table_id;
    insert into public.conversations (table_id, venue_id, seated_user, joiner_user, via, ends_at)
    values (v_req.table_id, v_venue, v_user, v_req.from_user, 'request', now() + make_interval(mins => p_minutes))
    returning * into v_conv;
    perform app_private.add_member(v_conv.id, v_user);
  end if;
  update public.chat_requests set status = 'accepted', responded_at = now() where id = v_req.id;
  perform app_private.add_member(v_conv.id, v_req.from_user);
  return jsonb_build_object('accepted', true, 'conversation_id', v_conv.id, 'ends_at', v_conv.ends_at);
end $$;

-- ------------------------------------------------------- the conversation --
-- Everything one member may see: everyone's first name and member id, what
-- the group shares, the timer, how many want to end, and per person: my own
-- vote, whether we connected, and where a socials swap stands. Never anyone
-- else's vote, and never a declined swap.
create or replace function public.my_conversation(p_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public, app_private as $$
declare
  v_user uuid := auth.uid();
  v_conv public.conversations;
  v_me   public.conversation_members;
  v_n    integer;
  v_want integer;
begin
  -- No id: my live conversation, or else one that ended in the last 15
  -- minutes that I haven't finished voting on.
  select c.* into v_conv from public.conversations c
  join public.conversation_members m on m.conversation_id = c.id and m.user_id = v_user
  where (p_id is not null and c.id = p_id)
     or (p_id is null and (m.live or (c.ended_at > now() - interval '15 minutes' and exists (
           select 1 from public.conversation_members o
           where o.conversation_id = c.id and o.user_id <> v_user
             and not exists (select 1 from public.pair_votes pv
                             where pv.conversation_id = c.id and pv.voter = v_user and pv.about = o.user_id)))))
  order by m.live desc, c.started_at desc limit 1;
  if not found then return null; end if;

  select * into v_me from public.conversation_members where conversation_id = v_conv.id and user_id = v_user;
  select count(*), count(*) filter (where wants_end) into v_n, v_want
  from public.conversation_members where conversation_id = v_conv.id and live;

  return jsonb_build_object(
    'id', v_conv.id,
    'via', v_conv.via,
    'started_at', v_conv.started_at,
    'ends_at', v_conv.ends_at,
    'ended_at', v_conv.ended_at,
    'end_reason', v_conv.end_reason,
    'i_am_host', v_conv.seated_user = v_user,
    'my_member_id', v_me.id,
    'shared', app_private.group_shared(v_conv.id),
    'end_votes', jsonb_build_object('wanting', v_want, 'present', v_n, 'needed', ceil(v_n / 2.0)::int, 'me', v_me.wants_end),
    'my_extend', v_me.extend,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'member_id', m.id,
        'first_name', app_private.first_name(m.user_id),
        'is_me', m.user_id = v_user,
        'here', m.left_at is null,
        'my_vote', pv.vote,
        'connected', m.user_id <> v_user and pv.vote = 'good' and exists (
          select 1 from public.connections cn
          where cn.user_a = least(v_user, m.user_id) and cn.user_b = greatest(v_user, m.user_id)),
        'swap', case
          when m.user_id = v_user then null
          when sx.status = 'accepted' then 'swapped'
          when sx.requested_by = v_user then 'asked'            -- pending or declined: looks the same
          when sx.status = 'pending' then 'they_asked'
          when sx.id is not null then 'closed'                  -- I declined theirs
          when pv.vote = 'good' then 'can_ask'
          else 'none' end
      ) order by m.joined_at)
      from public.conversation_members m
      left join public.pair_votes pv on pv.conversation_id = v_conv.id and pv.voter = v_user and pv.about = m.user_id
      left join public.social_exchanges sx on sx.user_a = least(v_user, m.user_id) and sx.user_b = greatest(v_user, m.user_id)
      where m.conversation_id = v_conv.id
    ), '[]'::jsonb),
    -- 080 fields, kept so older screens still work.
    'their_first_name', (select string_agg(app_private.first_name(m.user_id), ', ' order by m.joined_at)
                         from public.conversation_members m
                         where m.conversation_id = v_conv.id and m.user_id <> v_user),
    'my_vote', (select case when bool_and(pv.vote = 'good') then 'good' when count(pv.vote) > 0 then 'not_for_me' end
                from public.pair_votes pv where pv.conversation_id = v_conv.id and pv.voter = v_user),
    'connected', exists (select 1 from public.connections where conversation_id = v_conv.id
                         and v_user in (user_a, user_b))
  );
end $$;

-- Tap End. The conversation ends once at least half of the people still in it
-- have tapped End (with two people, one tap).
create or replace function public.end_conversation()
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare v_m public.conversation_members; v_ended boolean; v_n integer; v_want integer;
begin
  v_m := app_private.my_live_member();
  if v_m.id is null then return jsonb_build_object('ended', false, 'conversation_id', null); end if;
  update public.conversation_members set wants_end = true where id = v_m.id;
  v_ended := app_private.maybe_end(v_m.conversation_id);
  select count(*), count(*) filter (where wants_end) into v_n, v_want
  from public.conversation_members where conversation_id = v_m.conversation_id and live;
  return jsonb_build_object('ended', v_ended, 'conversation_id', v_m.conversation_id,
                            'wanting', v_want, 'present', v_n, 'needed', ceil(v_n / 2.0)::int);
end $$;

-- Changed my mind about ending.
create or replace function public.keep_talking()
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
begin
  update public.conversation_members set wants_end = false where user_id = auth.uid() and live;
  return jsonb_build_object('ok', found);
end $$;

-- Leave on my own; the others carry on (or it ends if only one is left).
create or replace function public.leave_conversation()
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare v_conv uuid;
begin
  v_conv := app_private.leave_conversation(auth.uid());
  return jsonb_build_object('left', v_conv is not null, 'conversation_id', v_conv);
end $$;

-- At the timer: extend only if everyone still here chooses to; "wrap up"
-- counts as tapping End.
create or replace function public.vote_extend(p_extend boolean)
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare v_m public.conversation_members;
begin
  v_m := app_private.my_live_member();
  if v_m.id is null then raise exception 'No conversation in progress.' using hint = 'no_conversation'; end if;
  if not p_extend then
    update public.conversation_members set wants_end = true where id = v_m.id;
    if app_private.maybe_end(v_m.conversation_id) then return jsonb_build_object('status', 'wrapped_up'); end if;
    return jsonb_build_object('status', 'waiting');
  end if;
  update public.conversation_members set extend = true, wants_end = false where id = v_m.id;
  if not exists (select 1 from public.conversation_members
                 where conversation_id = v_m.conversation_id and live and extend is not true) then
    update public.conversations set ends_at = greatest(coalesce(ends_at, now()), now()) + interval '15 minutes'
    where id = v_m.conversation_id;
    update public.conversation_members set extend = null where conversation_id = v_m.conversation_id;
    return jsonb_build_object('status', 'extended');
  end if;
  return jsonb_build_object('status', 'waiting');
end $$;

-- Timed conversations end on their own 2 minutes after the timer (job).
create or replace function app_private.end_expired_conversations()
returns integer language plpgsql security definer set search_path = public, app_private as $$
declare r record; n integer := 0;
begin
  for r in select id from public.conversations
           where ended_at is null and ends_at is not null and ends_at < now() - interval '2 minutes' loop
    perform app_private.finish_conversation(r.id, 'timer');
    n := n + 1;
  end loop;
  return n;
end $$;

-- ------------------------------------------------------------- outcomes ----
create or replace function app_private.member_in(p_conv uuid, p_member uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select user_id from public.conversation_members where id = p_member and conversation_id = p_conv;
$$;

-- My private vote about one person. Both good -> a connection.
create or replace function public.vote_member(p_conversation_id uuid, p_member_id uuid, p_vote public.vote)
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare v_user uuid := auth.uid(); v_other uuid; v_connected boolean := false;
begin
  if not exists (select 1 from public.conversation_members where conversation_id = p_conversation_id and user_id = v_user) then
    raise exception 'No such conversation.' using hint = 'no_conversation';
  end if;
  v_other := app_private.member_in(p_conversation_id, p_member_id);
  if v_other is null or v_other = v_user then raise exception 'No such person.' using hint = 'no_member'; end if;

  insert into public.pair_votes (conversation_id, voter, about, vote) values (p_conversation_id, v_user, v_other, p_vote)
  on conflict (conversation_id, voter, about) do update set vote = excluded.vote, created_at = now();

  if p_vote = 'good' and not app_private.is_blocked(v_user, v_other) and exists (
       select 1 from public.pair_votes where conversation_id = p_conversation_id
         and voter = v_other and about = v_user and vote = 'good') then
    insert into public.connections (user_a, user_b, conversation_id)
    values (least(v_user, v_other), greatest(v_user, v_other), p_conversation_id)
    on conflict (user_a, user_b) do update set conversation_id = excluded.conversation_id;
    v_connected := true;
  end if;
  -- Only ever reports a MUTUAL result.
  return jsonb_build_object('recorded', true, 'connected', v_connected);
end $$;

-- 080's single vote, now meaning "the same vote about everyone".
create or replace function public.vote_conversation(p_conversation_id uuid, p_vote public.vote)
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare r record; v_any boolean := false;
begin
  for r in select id from public.conversation_members
           where conversation_id = p_conversation_id and user_id <> auth.uid() loop
    if (public.vote_member(p_conversation_id, r.id, p_vote) ->> 'connected')::boolean then v_any := true; end if;
  end loop;
  return jsonb_build_object('recorded', true, 'connected', v_any);
end $$;

-- Ask to swap socials with someone I voted good on (or am connected with).
-- One ask per pair, ever. If they had already asked me, it's a swap.
create or replace function public.request_social_swap(p_conversation_id uuid, p_member_id uuid)
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare
  v_user uuid := auth.uid();
  v_other uuid;
  v_x public.social_exchanges;
begin
  v_other := app_private.member_in(p_conversation_id, p_member_id);
  if v_other is null or v_other = v_user
     or not exists (select 1 from public.conversation_members where conversation_id = p_conversation_id and user_id = v_user) then
    raise exception 'No such person.' using hint = 'no_member';
  end if;
  if not exists (select 1 from public.pair_votes where conversation_id = p_conversation_id
                   and voter = v_user and about = v_other and vote = 'good') then
    raise exception 'Say it was a good conversation first.' using hint = 'vote_first';
  end if;

  select * into v_x from public.social_exchanges where user_a = least(v_user, v_other) and user_b = greatest(v_user, v_other);
  if found then
    if v_x.status = 'pending' and v_x.requested_by = v_other then
      update public.social_exchanges set status = 'accepted', responded_at = now() where id = v_x.id;
      return jsonb_build_object('status', 'swapped');
    end if;
    -- Already asked (any outcome), or I declined theirs: nothing changes, nothing revealed.
    return jsonb_build_object('status', case when v_x.status = 'accepted' then 'swapped' else 'asked' end);
  end if;
  -- Blocked pairs get the same answer as everyone else, and nothing is stored.
  if app_private.is_blocked(v_user, v_other) then return jsonb_build_object('status', 'asked'); end if;

  insert into public.social_exchanges (user_a, user_b, requested_by, conversation_id)
  values (least(v_user, v_other), greatest(v_user, v_other), v_user, p_conversation_id);
  return jsonb_build_object('status', 'asked');
end $$;

-- Swap requests waiting for my answer.
create or replace function public.my_swap_requests()
returns table (id uuid, first_name text, venue_name text, met_at timestamptz, shared jsonb)
language sql stable security definer set search_path = public, app_private as $$
  select x.id, app_private.first_name(x.requested_by), v.name, c.started_at,
         app_private.shared_between(auth.uid(), x.requested_by)
  from public.social_exchanges x
  left join public.conversations c on c.id = x.conversation_id
  left join public.venues v on v.id = c.venue_id
  where x.status = 'pending' and x.requested_by <> auth.uid() and auth.uid() in (x.user_a, x.user_b)
    and not app_private.is_blocked(x.user_a, x.user_b)
  order by x.created_at desc;
$$;

create or replace function public.respond_to_swap(p_swap_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.social_exchanges
  set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
  where id = p_swap_id and status = 'pending' and requested_by <> auth.uid() and auth.uid() in (user_a, user_b);
  if not found then raise exception 'That request is no longer open.' using hint = 'swap_closed'; end if;
  return jsonb_build_object('swapped', p_accept);
end $$;

-- People I swapped socials with: first name and THEIR socials, nothing else.
create or replace function public.my_contacts()
returns table (id uuid, first_name text, socials jsonb, venue_name text, met_at timestamptz, connected boolean)
language sql stable security definer set search_path = public, app_private as $$
  select x.id, app_private.first_name(o.id), o.socials, v.name, c.started_at,
         exists (select 1 from public.connections cn where cn.user_a = x.user_a and cn.user_b = x.user_b)
  from public.social_exchanges x
  join public.users o on o.id = case when x.user_a = auth.uid() then x.user_b else x.user_a end
  left join public.conversations c on c.id = x.conversation_id
  left join public.venues v on v.id = c.venue_id
  where x.status = 'accepted' and auth.uid() in (x.user_a, x.user_b)
    and not app_private.is_blocked(x.user_a, x.user_b)
  order by x.responded_at desc;
$$;

-- Connections now also carry socials once swapped.
drop function if exists public.my_connections();
create function public.my_connections()
returns table (id uuid, first_name text, shared jsonb, created_at timestamptz, venue_name text, socials jsonb)
language sql stable security definer set search_path = public, app_private as $$
  select c.id,
         app_private.first_name(o.id),
         app_private.shared_between(c.user_a, c.user_b),
         c.created_at,
         v.name,
         case when exists (select 1 from public.social_exchanges x
                           where x.user_a = c.user_a and x.user_b = c.user_b and x.status = 'accepted')
              then o.socials end
  from public.connections c
  join public.users o on o.id = case when c.user_a = auth.uid() then c.user_b else c.user_a end
  left join public.conversations cv on cv.id = c.conversation_id
  left join public.venues v on v.id = cv.venue_id
  where auth.uid() in (c.user_a, c.user_b)
    and not app_private.is_blocked(c.user_a, c.user_b)
  order by c.created_at desc;
$$;

-- ---------------------------------------------------------------- safety ---
-- Anonymous report about one member. The reported person is never told who.
-- Immediately: their profile is flagged for review, the reporter blocks them
-- and leaves the conversation (which ends if fewer than two remain).
create or replace function public.report_member(p_conversation_id uuid, p_member_id uuid, p_reason text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare v_user uuid := auth.uid(); v_other uuid;
begin
  if not exists (select 1 from public.conversation_members where conversation_id = p_conversation_id and user_id = v_user) then
    raise exception 'No such conversation.' using hint = 'no_conversation';
  end if;
  v_other := app_private.member_in(p_conversation_id, p_member_id);
  if v_other is null or v_other = v_user then raise exception 'No such person.' using hint = 'no_member'; end if;

  insert into public.reports (reporter, reported, conversation_id, reason, note)
  values (v_user, v_other, p_conversation_id, p_reason, left(p_note, 1000));
  update public.users set flagged_at = coalesce(flagged_at, now()) where id = v_other;
  insert into public.blocks (blocker, blocked) values (v_user, v_other) on conflict do nothing;
  -- No swap or connection survives a report.
  delete from public.social_exchanges where user_a = least(v_user, v_other) and user_b = greatest(v_user, v_other);
  delete from public.connections where user_a = least(v_user, v_other) and user_b = greatest(v_user, v_other);
  if exists (select 1 from public.conversation_members where conversation_id = p_conversation_id and user_id = v_user and live) then
    perform app_private.leave_conversation(v_user, 'reported');
  end if;
  return jsonb_build_object('reported', true);
end $$;

-- 080's report (no member given): fine for two people, ambiguous in a group.
create or replace function public.report_user(p_conversation_id uuid, p_reason text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare v_member uuid;
begin
  select id into v_member from public.conversation_members
  where conversation_id = p_conversation_id and user_id <> auth.uid();
  if (select count(*) from public.conversation_members
      where conversation_id = p_conversation_id and user_id <> auth.uid()) <> 1 then
    raise exception 'Choose who you are reporting.' using hint = 'choose_member';
  end if;
  return public.report_member(p_conversation_id, v_member, p_reason, p_note);
end $$;

create or replace function public.block_member(p_conversation_id uuid, p_member_id uuid)
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare v_user uuid := auth.uid(); v_other uuid;
begin
  if not exists (select 1 from public.conversation_members where conversation_id = p_conversation_id and user_id = v_user) then
    raise exception 'No such conversation.' using hint = 'no_conversation';
  end if;
  v_other := app_private.member_in(p_conversation_id, p_member_id);
  if v_other is null or v_other = v_user then raise exception 'No such person.' using hint = 'no_member'; end if;
  insert into public.blocks (blocker, blocked) values (v_user, v_other) on conflict do nothing;
  return jsonb_build_object('blocked', true);
end $$;

create or replace function public.block_from_conversation(p_conversation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare r record;
begin
  -- 080 behaviour for two people; in a group it blocks nobody (ambiguous).
  if (select count(*) from public.conversation_members
      where conversation_id = p_conversation_id and user_id <> auth.uid()) <> 1 then
    raise exception 'Choose who you are blocking.' using hint = 'choose_member';
  end if;
  select id into r from public.conversation_members where conversation_id = p_conversation_id and user_id <> auth.uid();
  return public.block_member(p_conversation_id, r.id);
end $$;

-- Help -> "Leave now": out of any conversation, off the table, requests off.
create or replace function public.leave_now()
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare v_user uuid := auth.uid();
begin
  perform app_private.leave_conversation(v_user);
  update public.chat_requests set status = 'cancelled', responded_at = now()
  where (from_user = v_user or to_user = v_user) and status = 'pending';
  with closed as (
    update public.checkins set checked_out_at = now() where user_id = v_user and checked_out_at is null returning table_id)
  update public.tables set status = 'open' where id in (select table_id from closed where table_id is not null);
  return jsonb_build_object('left', true);
end $$;

-- 22:00 shutoff: every live conversation ends with a full reset.
create or replace function app_private.close_boxes_for_night()
returns integer language plpgsql security definer set search_path = public, app_private as $$
declare r record; v_count integer := 0;
begin
  if public.boxes_open_now() then return 0; end if;
  for r in select id from public.conversations where ended_at is null loop
    perform app_private.finish_conversation(r.id, 'nightly');
    v_count := v_count + 1;
  end loop;
  with closed as (
    update public.checkins set checked_out_at = now()
    where checked_out_at is null and table_id is not null returning table_id)
  update public.tables set status = 'open' where id in (select table_id from closed);
  return v_count;
end $$;

-- Moderators: who has been reported, how often, by how many people.
create or replace view app_private.flag_queue as
  select r.reported as user_id, u.flagged_at,
         count(*) filter (where r.status = 'open') as open_reports,
         count(distinct r.reporter) as reporters,
         max(r.created_at) as last_report_at
  from public.reports r join public.users u on u.id = r.reported
  group by r.reported, u.flagged_at;
revoke all on app_private.flag_queue from anon, authenticated;

-- ---------------------------------------------------------------- history --
-- My chatting history: one line per conversation I was in. Counts and first
-- names of mutual connections only; nothing about how anyone voted.
create or replace function public.my_chat_history(p_limit integer default 30)
returns table (id uuid, venue_name text, table_label text, started_at timestamptz, ended_at timestamptz,
               minutes integer, people integer, end_reason text, connected_with text[], swapped integer)
language sql stable security definer set search_path = public, app_private as $$
  select c.id, v.name, t.label, c.started_at, c.ended_at,
         (extract(epoch from (coalesce(c.ended_at, now()) - c.started_at)) / 60)::int,
         (select count(*)::int from public.conversation_members m2 where m2.conversation_id = c.id),
         c.end_reason,
         coalesce((select array_agg(app_private.first_name(case when cn.user_a = auth.uid() then cn.user_b else cn.user_a end))
                   from public.connections cn
                   where cn.conversation_id = c.id and auth.uid() in (cn.user_a, cn.user_b)
                     and not app_private.is_blocked(cn.user_a, cn.user_b)), '{}'),
         (select count(*)::int from public.social_exchanges x
          where x.conversation_id = c.id and x.status = 'accepted' and auth.uid() in (x.user_a, x.user_b))
  from public.conversation_members m
  join public.conversations c on c.id = m.conversation_id
  left join public.venues v on v.id = c.venue_id
  left join public.tables t on t.id = c.table_id
  where m.user_id = auth.uid() and c.ended_at is not null
  order by c.started_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

-- ------------------------------------------------------------- grants ------
do $$
declare f text;
begin
  foreach f in array array[
    'join_green(uuid)', 'request_chat(uuid)', 'my_request_status(uuid)',
    'respond_to_request(uuid, boolean, integer)', 'my_conversation(uuid)', 'end_conversation()',
    'keep_talking()', 'leave_conversation()', 'vote_extend(boolean)',
    'vote_member(uuid, uuid, public.vote)', 'vote_conversation(uuid, public.vote)',
    'request_social_swap(uuid, uuid)', 'my_swap_requests()', 'respond_to_swap(uuid, boolean)',
    'my_contacts()', 'my_connections()',
    'report_member(uuid, uuid, text, text)', 'report_user(uuid, text, text)',
    'block_member(uuid, uuid)', 'block_from_conversation(uuid)', 'leave_now()', 'my_chat_history(integer)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
grant execute on function public.table_light(uuid) to anon, authenticated;

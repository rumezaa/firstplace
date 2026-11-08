-- Review fixes: apply in a transaction. Safe to reapply.
-- Serialize the short claim/join/request transitions for the demo so a person
-- cannot participate at two tables and simultaneous joins return a calm error.
begin;

create or replace function public.claim_table(p_table_id uuid, p_light public.light_color default 'yellow')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user  uuid := auth.uid();
  v_venue uuid;
  v_enabled boolean;
  v_row   public.checkins;
begin
  perform pg_advisory_xact_lock(120, 1);
  if v_user is null then raise exception 'Please sign in first.'; end if;
  perform app_private.expire_conversation_state();
  select venue_id, box_enabled into v_venue, v_enabled from public.tables where id = p_table_id for update;
  if not found then raise exception 'That table isn''t a conversation zone.' using hint = 'table_not_found'; end if;
  if not v_enabled or not public.boxes_open_now() then
    raise exception 'This table isn''t a conversation zone right now.' using hint = 'box_off';
  end if;
  if (app_private.table_claim(p_table_id)).user_id is distinct from null
     and (app_private.table_claim(p_table_id)).user_id <> v_user then
    raise exception 'Someone is already here. Try the nearest free table.' using hint = 'table_taken';
  end if;

  if exists (select 1 from public.conversations where ended_at is null and v_user in (seated_user, joiner_user)) then
    raise exception 'Finish your conversation before changing tables.' using hint = 'conversation_active';
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

create or replace function public.join_green(p_table_id uuid)
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare
  v_user  uuid := auth.uid();
  v_claim public.checkins;
  v_conv  public.conversations;
begin
  perform pg_advisory_xact_lock(120, 1);
  if v_user is null then raise exception 'Please sign in first.'; end if;
  v_claim := app_private.table_claim(p_table_id);
  if v_claim.id is null or v_claim.user_id = v_user or public.table_light(p_table_id) <> 'green'
     or app_private.is_blocked(v_user, v_claim.user_id) then
    -- Same message for every reason: never reveal why.
    raise exception 'Not available right now.' using hint = 'not_available';
  end if;
  if exists (select 1 from public.conversations where ended_at is null and (v_user in (seated_user, joiner_user) or v_claim.user_id in (seated_user, joiner_user))) then
    raise exception 'Not available right now.' using hint = 'not_available';
  end if;
  insert into public.conversations (table_id, venue_id, seated_user, joiner_user, via)
  values (p_table_id, v_claim.venue_id, v_claim.user_id, v_user, 'green') returning * into v_conv;
  return jsonb_build_object('conversation_id', v_conv.id);
end $$;

create or replace function public.request_chat(p_table_id uuid)
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare
  v_user  uuid := auth.uid();
  v_claim public.checkins;
  v_req   public.chat_requests;
begin
  perform pg_advisory_xact_lock(120, 1);
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

  select * into v_req from public.chat_requests where table_id = p_table_id and from_user = v_user and to_user = v_claim.user_id and status = 'pending' and created_at > now() - public.request_ttl() order by created_at desc limit 1;
  if found then return jsonb_build_object('request_id', v_req.id, 'expires_at', v_req.created_at + public.request_ttl()); end if;
  insert into public.chat_requests (table_id, from_user, to_user)
  values (p_table_id, v_user, v_claim.user_id) returning * into v_req;
  return jsonb_build_object('request_id', v_req.id, 'expires_at', v_req.created_at + public.request_ttl());
end $$;

create or replace function public.respond_to_request(p_request_id uuid, p_accept boolean, p_minutes integer default 30)
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare
  v_user uuid := auth.uid();
  v_req  public.chat_requests;
  v_conv public.conversations;
  v_venue uuid;
begin
  perform pg_advisory_xact_lock(120, 1);
  select * into v_req from public.chat_requests where id = p_request_id and to_user = v_user for update;
  if not found or v_req.status <> 'pending' or v_req.created_at <= now() - public.request_ttl() then
    raise exception 'That request has expired.' using hint = 'request_expired';
  end if;

  if not p_accept then
    update public.chat_requests set status = 'declined', responded_at = now() where id = v_req.id;
    return jsonb_build_object('accepted', false);
  end if;

  if app_private.is_blocked(v_user, v_req.from_user)
     or (app_private.table_claim(v_req.table_id)).user_id is distinct from v_user
     or public.table_light(v_req.table_id) <> 'yellow'
     or exists (select 1 from public.conversations where ended_at is null and (v_user in (seated_user, joiner_user) or v_req.from_user in (seated_user, joiner_user))) then
    raise exception 'Not available right now.' using hint = 'not_available';
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

create or replace function public.vote_conversation(p_conversation_id uuid, p_vote public.vote)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_conv public.conversations;
begin
  update public.conversations set
    seated_vote = case when seated_user = auth.uid() then p_vote else seated_vote end,
    joiner_vote = case when joiner_user = auth.uid() then p_vote else joiner_vote end,
    ended_at = coalesce(ended_at, now())
  where id = p_conversation_id and auth.uid() in (seated_user, joiner_user)
    and (ended_at is null or ended_at > now() - interval '15 minutes')
  returning * into v_conv;
  if not found then raise exception 'No such conversation.' using hint = 'no_conversation'; end if;

  if v_conv.seated_vote = 'good' and v_conv.joiner_vote = 'good' then
    insert into public.connections (user_a, user_b, conversation_id)
    values (least(v_conv.seated_user, v_conv.joiner_user), greatest(v_conv.seated_user, v_conv.joiner_user), v_conv.id)
    on conflict (user_a, user_b) do update set conversation_id = excluded.conversation_id;
  end if;
  return jsonb_build_object('recorded', true);
end $$;

create or replace function public.open_meetup(p_connection_id uuid)
returns jsonb language plpgsql security definer set search_path = public, app_private as $$
declare v_conn public.connections; v_id uuid;
begin
  select * into v_conn from public.connections where id = p_connection_id for update;
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

-- Expired away holds must not keep the box lit between cleanup jobs.
create or replace function app_private.table_claim(p_table uuid)
returns public.checkins language sql stable security definer set search_path = public, app_private as $$
  select c.* from app_private.active_checkins c
  where c.table_id = p_table and (c.away_until is null or c.away_until > now())
  order by c.checked_in_at desc limit 1;
$$;

create or replace function app_private.expire_conversation_state()
returns integer language plpgsql security definer set search_path = public, app_private as $$
declare n integer;
begin
  perform pg_advisory_xact_lock(120, 1);
  update public.conversations set ended_at = ends_at where ended_at is null and ends_at <= now();
  with closed as (
    update public.checkins set checked_out_at = now()
    where checked_out_at is null and (checked_in_at <= now() - public.session_length() or away_until <= now())
    returning table_id, user_id
  ), ended as (
    update public.conversations set ended_at = now()
    where ended_at is null and (seated_user in (select user_id from closed) or joiner_user in (select user_id from closed))
  )
  update public.tables set status = 'open' where id in (select table_id from closed);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function app_private.expire_conversation_state() from public;
commit;

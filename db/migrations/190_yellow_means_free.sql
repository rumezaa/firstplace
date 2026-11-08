-- ============================================================================
-- ChatterBox — yellow now means "free seat"
-- ============================================================================
-- New meaning of the lights:
--   yellow = nobody here: the table is free to take
--   green  = someone's here and open to talk: say hi
--   red    = someone's here and would rather not be disturbed (or mid-conversation)
--   off    = the box is off (closed, after hours, or not a conversation table)
--
-- So people who sit down choose only green or red. A claim that still asks for
-- yellow (older app builds, old defaults) is stored as green. Asking in the app
-- (request_chat) needed a claimed yellow table, so it no longer applies.
-- Safe to rerun.

create or replace function public.table_light(p_table uuid)
returns text language plpgsql stable security definer set search_path = public, app_private as $$
declare
  v_enabled boolean;
  v_claim   public.checkins;
begin
  select box_enabled into v_enabled from public.tables where id = p_table;
  if not found or not v_enabled or not public.boxes_open_now() then return 'off'; end if;

  v_claim := app_private.table_claim(p_table);
  if v_claim.id is null then return 'yellow'; end if;  -- free seat

  -- In a conversation at this table: red, so nobody else tries to join.
  if exists (select 1 from public.conversations where table_id = p_table and ended_at is null) then
    return 'red';
  end if;
  return case when v_claim.light = 'red' then 'red' else 'green' end;
end $$;

create or replace function app_private.seated_light_only()
returns trigger language plpgsql as $$
begin
  if new.light = 'yellow' then
    new.light := 'green';
    new.open_to_chat := true;
  end if;
  return new;
end $$;

drop trigger if exists checkins_seated_light_only on public.checkins;
create trigger checkins_seated_light_only
  before insert or update of light on public.checkins
  for each row execute function app_private.seated_light_only();

-- Anyone sitting on yellow right now becomes green.
update public.checkins set light = 'green', open_to_chat = true
where checked_out_at is null and light = 'yellow';

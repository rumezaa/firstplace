-- ============================================================================
-- Third Place — core schema
-- ============================================================================
-- Columns marked "beyond spec" were added because a screen needs them; they are
-- called out so you can drop them if you'd rather compute the value elsewhere.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists app_private;
comment on schema app_private is
  'Internal views/functions that read across all users. NEVER granted to anon or
   authenticated — the public aggregate views in 0300 are the only way out.';

-- ---------------------------------------------------------------- enums ------
do $$ begin
  create type public.venue_type    as enum ('cafe', 'study', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.table_status  as enum ('open', 'taken');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.reward_type   as enum ('frequent', 'passport');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.reward_status as enum ('in_progress', 'earned', 'redeemed');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------ constants ------
-- A check-in is considered over after this long, even if nobody tapped
-- "check out". Referenced by the aggregate views and auto_checkout_stale().
create or replace function public.session_length()
returns interval language sql immutable parallel safe as $$
  select interval '3 hours';
$$;

-- Calgary. Used for "busiest hours" and the weekday on a familiar-faces card.
create or replace function public.local_tz()
returns text language sql immutable parallel safe as $$
  select 'America/Edmonton';
$$;

-- ---------------------------------------------------------------- users ------
create table if not exists public.users (
  id                    uuid primary key references auth.users (id) on delete cascade,
  name                  text        not null default '',
  interests             text[]      not null default '{}',
  vibe_tags             text[]      not null default '{}',
  incognito             boolean     not null default false,
  familiar_faces_opt_in boolean     not null default true,
  created_at            timestamptz not null default now()
);

comment on column public.users.incognito is
  'When true the user is excluded from every aggregate and from familiar faces.';

-- Keep public.users in step with auth.users on sign-up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      ''
    )
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------- venues ------
create table if not exists public.venues (
  id              uuid primary key default gen_random_uuid(),
  name            text              not null,
  lat             double precision  not null check (lat between -90 and 90),
  lng             double precision  not null check (lng between -180 and 180),
  type            public.venue_type not null default 'cafe',
  address         text,
  insider_info    text,
  popular_drinks  text[]            not null default '{}',
  vibe_summary    text,
  -- beyond spec: backs the "quiet" and "good for groups" map filter chips.
  is_quiet        boolean           not null default false,
  good_for_groups boolean           not null default false,
  created_at      timestamptz       not null default now()
);

create index if not exists venues_location_idx on public.venues (lat, lng);

-- --------------------------------------------------------------- tables ------
create table if not exists public.tables (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid                not null references public.venues (id) on delete cascade,
  label         text                not null,
  seats         smallint            not null default 2 check (seats between 1 and 20),
  status        public.table_status not null default 'open',
  is_chat_table boolean             not null default false,
  updated_at    timestamptz         not null default now(),
  unique (venue_id, label)
);

-- Exactly one chat table per venue (at most one; a venue may have none).
create unique index if not exists tables_one_chat_table_per_venue
  on public.tables (venue_id) where is_chat_table;

create index if not exists tables_venue_idx on public.tables (venue_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists tables_touch_updated_at on public.tables;
create trigger tables_touch_updated_at
  before update on public.tables
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------- checkins ------
create table if not exists public.checkins (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid        not null references public.users (id)  on delete cascade,
  venue_id       uuid        not null references public.venues (id) on delete cascade,
  table_id       uuid                 references public.tables (id) on delete set null,
  open_to_chat   boolean     not null default false,
  checked_in_at  timestamptz not null default now(),
  checked_out_at timestamptz,
  constraint checkins_checkout_after_checkin
    check (checked_out_at is null or checked_out_at >= checked_in_at)
);

-- One live session per person. Enforces the "check out of the old table first"
-- behaviour in public.check_in().
create unique index if not exists checkins_one_open_per_user
  on public.checkins (user_id) where checked_out_at is null;

create index if not exists checkins_venue_time_idx  on public.checkins (venue_id, checked_in_at desc);
create index if not exists checkins_user_time_idx    on public.checkins (user_id, checked_in_at desc);
create index if not exists checkins_open_idx         on public.checkins (venue_id) where checked_out_at is null;

-- ---------------------------------------------------------- kiosk_codes ------
create table if not exists public.kiosk_codes (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid        not null references public.venues (id) on delete cascade,
  code       text        not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists kiosk_codes_venue_idx on public.kiosk_codes (venue_id, expires_at desc);

-- ------------------------------------------------------- familiar_faces ------
create table if not exists public.familiar_faces (
  id              uuid primary key default gen_random_uuid(),
  user_a          uuid        not null references public.users (id)  on delete cascade,
  user_b          uuid        not null references public.users (id)  on delete cascade,
  venue_id        uuid        not null references public.venues (id) on delete cascade,
  overlap_count   integer     not null default 0,
  a_accepted      boolean     not null default false,
  b_accepted      boolean     not null default false,
  -- beyond spec: the card copy says "...keep crossing paths at X on [day]",
  -- so the matcher records which weekday the overlaps cluster on.
  common_weekday  smallint             check (common_weekday between 0 and 6),
  last_overlap_at timestamptz,
  created_at      timestamptz not null default now(),
  -- user_a < user_b keeps a pair from being stored twice.
  constraint familiar_faces_ordered check (user_a < user_b),
  unique (user_a, user_b, venue_id)
);

comment on column public.familiar_faces.common_weekday is
  '0 = Sunday .. 6 = Saturday, matching Postgres extract(dow).';

create index if not exists familiar_faces_user_a_idx on public.familiar_faces (user_a);
create index if not exists familiar_faces_user_b_idx on public.familiar_faces (user_b);

-- -------------------------------------------------------------- rewards ------
create table if not exists public.rewards (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid                 not null references public.users (id)  on delete cascade,
  venue_id uuid                          references public.venues (id) on delete cascade,
  type     public.reward_type   not null,
  progress integer              not null default 0 check (progress >= 0),
  status   public.reward_status not null default 'in_progress'
);

comment on column public.rewards.venue_id is
  'Set for type = frequent (progress toward that one cafe). NULL for type =
   passport (progress is the number of distinct venues visited).';

-- venue_id is nullable, so coalesce it to make the uniqueness enforceable.
create unique index if not exists rewards_one_per_user_scope
  on public.rewards (
    user_id,
    type,
    coalesce(venue_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists rewards_user_idx on public.rewards (user_id);

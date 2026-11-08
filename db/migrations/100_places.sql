-- ============================================================================
-- FirstPlace — venues imported from the Google Places API
-- ============================================================================
-- Until now every venue came from db/seed.sql, which holds twelve placeholder
-- cafes. The server can now pull real places for whatever part of the map the
-- phone is looking at (server/src/places.ts) and upsert them here.
--
-- `google_place_id` is the natural key for an imported venue: it is stable
-- across Places responses, so re-syncing updates a row instead of duplicating
-- it. Seeded venues keep source = 'seed' and a null place id.
--
-- Nothing here changes the privacy model: venues were already world-readable
-- (policy venues_select_all in 020_rls.sql) and these columns are all public
-- facts about a business. Writes happen through asSystem(), never from a phone.

alter table public.venues
  add column if not exists google_place_id text,
  -- 'seed' = db/seed.sql placeholder, 'places' = Google Places API.
  add column if not exists source          text    not null default 'seed',
  add column if not exists rating          real,
  add column if not exists rating_count    integer,
  -- Places PriceLevel enum, e.g. PRICE_LEVEL_INEXPENSIVE. Null when unknown.
  add column if not exists price_level     text,
  add column if not exists maps_uri        text,
  add column if not exists website_uri     text,
  -- 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY'.
  add column if not exists business_status text,
  -- currentOpeningHours.openNow at the time of the last sync. Null = unknown.
  add column if not exists open_now        boolean,
  add column if not exists synced_at       timestamptz;

do $$ begin
  alter table public.venues add constraint venues_source_known
    check (source in ('seed', 'places'));
exception when duplicate_object then null; end $$;

-- One row per Google place. Partial, so the many seeded rows with a null place
-- id do not collide with each other.
create unique index if not exists venues_google_place_id_key
  on public.venues (google_place_id) where google_place_id is not null;

-- The map asks for "venues near here", so the common query is a bounding box.
create index if not exists venues_source_idx on public.venues (source);

comment on column public.venues.google_place_id is
  'Places API (New) place id ("ChIJ..."). Null for venues from db/seed.sql.';
comment on column public.venues.open_now is
  'Snapshot from the last Places sync, not live. Null when Google did not say.';
comment on column public.venues.synced_at is
  'When this row was last written from the Places API. Null for seeded rows.';

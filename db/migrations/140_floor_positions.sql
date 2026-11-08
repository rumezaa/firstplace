-- ============================================================================
-- FirstPlace — table positions on a floor map
-- ============================================================================
-- See docs/specs/2026-11-08-floor-map-design.md. pos_x / pos_y are 0..1 across
-- the floor outline drawn in src/lib/floorLayouts.ts; null = not placed (the
-- table stays in the list, off the map). Moving a box means editing a row.
-- Public facts about furniture, like the rest of public.tables. Safe to rerun.

alter table public.tables add column if not exists pos_x real check (pos_x between 0 and 1);
alter table public.tables add column if not exists pos_y real check (pos_y between 0 and 1);

update public.tables set pos_x = v.x, pos_y = v.y
from (values
  ('f3f3f3f3-0000-4000-8000-000000000001'::uuid, 0.22, 0.16),  -- Window table, by the windows
  ('f3f3f3f3-0000-4000-8000-000000000002'::uuid, 0.26, 0.50),  -- Centre table, open study
  ('f3f3f3f3-0000-4000-8000-000000000003'::uuid, 0.74, 0.62)   -- Stacks table, among the stacks
) as v(id, x, y)
where public.tables.id = v.id;

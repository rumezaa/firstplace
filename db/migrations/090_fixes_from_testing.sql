-- ============================================================================
-- FirstPlace: fixes found in the full laptop test (Nov 8)
-- ============================================================================
-- 1. Familiar faces ignored blocks: after reporting someone, they still
--    appeared as a mutual familiar face. Blocked pairs are now hidden.

create or replace function public.my_familiar_faces()
returns table (
  id              uuid,
  venue_id        uuid,
  venue_name      text,
  overlap_count   integer,
  common_weekday  smallint,
  last_overlap_at timestamptz,
  i_accepted      boolean,
  they_accepted   boolean,
  mutual          boolean,
  their_first_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    ff.id,
    ff.venue_id,
    v.name,
    ff.overlap_count,
    ff.common_weekday,
    ff.last_overlap_at,
    case when ff.user_a = auth.uid() then ff.a_accepted else ff.b_accepted end,
    case when ff.user_a = auth.uid() then ff.b_accepted else ff.a_accepted end,
    (ff.a_accepted and ff.b_accepted),
    case
      when ff.a_accepted and ff.b_accepted
        then nullif(split_part(trim(other.name), ' ', 1), '')
      else null
    end
  from public.familiar_faces ff
  join public.venues v     on v.id = ff.venue_id
  join public.users  me    on me.id = auth.uid()
  join public.users  other on other.id = case when ff.user_a = auth.uid()
                                              then ff.user_b else ff.user_a end
  where auth.uid() in (ff.user_a, ff.user_b)
    -- either side opting out, or going incognito, hides the pair for both.
    and me.familiar_faces_opt_in
    and not me.incognito
    and other.familiar_faces_opt_in
    and not other.incognito
    -- A block (or a report, which blocks) hides the pair for both people.
    and not app_private.is_blocked(me.id, other.id)
  order by ff.overlap_count desc, ff.last_overlap_at desc nulls last;
$$;

revoke all on function public.my_familiar_faces() from public;

grant execute on function public.my_familiar_faces() to authenticated;

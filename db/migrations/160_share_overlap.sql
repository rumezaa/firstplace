-- ============================================================================
-- FirstPlace — "Show what we have in common" (privacy switch)
-- ============================================================================
-- Everything that shows two people their overlap (request cards, the
-- conversation screen, connections, familiar faces, meetup ideas) and every
-- Gemini prompt built from it goes through app_private.shared_between(). If
-- EITHER person has switched sharing off, it returns an empty overlap: nothing
-- is shown and nothing about interests reaches Gemini; prompts fall back to
-- generic ones. On by default; changeable any time in Profile. Safe to rerun.

alter table public.users add column if not exists share_overlap boolean not null default true;

create or replace function app_private.shared_between(a uuid, b uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when not (ua.share_overlap and ub.share_overlap)
      then jsonb_build_object('interests', '[]'::jsonb, 'topics', '[]'::jsonb, 'languages', '[]'::jsonb)
    else jsonb_build_object(
      'interests', coalesce((select jsonb_agg(x) from (select unnest(ua.interests) intersect select unnest(ub.interests) limit 3) s(x)), '[]'::jsonb),
      'topics',    coalesce((select jsonb_agg(x) from (select unnest(ua.topics)    intersect select unnest(ub.topics)    limit 5) s(x)), '[]'::jsonb),
      'languages', coalesce((select jsonb_agg(x) from (select unnest(ua.languages) intersect select unnest(ub.languages)) s(x)), '[]'::jsonb)
    )
  end
  from public.users ua, public.users ub where ua.id = a and ub.id = b;
$$;

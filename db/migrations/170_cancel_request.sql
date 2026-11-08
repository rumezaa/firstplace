-- ============================================================================
-- FirstPlace — take back a chat request
-- ============================================================================
-- The asker can withdraw a pending request instead of waiting out the two
-- minutes. It simply disappears from the seated person's list; they are never
-- told it was withdrawn, the same as a request that expires. Safe to rerun.

create or replace function public.cancel_request(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_found boolean;
begin
  update public.chat_requests
     set status = 'cancelled', responded_at = now()
   where id = p_request_id and from_user = auth.uid() and status = 'pending'
  returning true into v_found;
  return jsonb_build_object('cancelled', coalesce(v_found, false));
end $$;

revoke all on function public.cancel_request(uuid) from public;
grant execute on function public.cancel_request(uuid) to authenticated;

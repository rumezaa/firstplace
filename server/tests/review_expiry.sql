-- Run only on a seeded disposable local database after review_test.py.
-- All time-travel changes are rolled back.
begin;
do $$
declare c public.conversations; t uuid; u uuid; result jsonb;
begin
 select * into c from public.conversations order by started_at desc limit 1;
 if c.id is null then raise exception 'Run review_test.py first'; end if;
 perform set_config('request.user_id', c.seated_user::text, true);
 update public.conversations set ended_at=now()-interval '16 minutes' where id=c.id;
 begin
   perform public.vote_conversation(c.id, 'good');
   raise exception 'Late vote was accepted' using errcode='XX000';
 exception when raise_exception then null;
 end;
 update public.conversations set ended_at=now()-interval '14 minutes' where id=c.id;
 perform public.vote_conversation(c.id, 'good');
 raise notice 'PASS votes work within 15 minutes and fail after';
 update public.conversations set ended_at=null, ends_at=now()-interval '1 second' where id=c.id;
 perform app_private.expire_conversation_state();
 if exists(select 1 from public.conversations where id=c.id and ended_at is null) then raise exception 'Timer did not end conversation'; end if;
 raise notice 'PASS conversation expires without either phone';
 select id into t from public.tables where box_enabled limit 1;
 select id into u from public.users where auth0_sub='seed|sam@thirdplace.test';
 perform set_config('request.user_id', u::text, true);
 perform public.leave_now();
 update public.checkins set checked_out_at=now() where table_id=t and checked_out_at is null;
 perform public.claim_table(t,'green');
 update public.checkins set away_until=now()-interval '1 second' where user_id=u and checked_out_at is null;
 if public.table_light(t)<>'yellow' then raise exception 'Expired away hold did not free the seat'; end if;
 perform app_private.expire_conversation_state();
 if exists(select 1 from public.checkins where user_id=u and checked_out_at is null) then raise exception 'Away claim not released'; end if;
 raise notice 'PASS expired away hold fails closed and releases';
 perform public.claim_table(t,'green');
 update public.checkins set checked_in_at=now()-interval '3 hours 1 minute' where user_id=u and checked_out_at is null;
 perform app_private.expire_conversation_state();
 if public.table_light(t)<>'yellow' then raise exception 'Three-hour claim not released'; end if;
 raise notice 'PASS three-hour checkout';
end $$;
rollback;

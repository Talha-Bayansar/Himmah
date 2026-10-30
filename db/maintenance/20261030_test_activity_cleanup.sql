-- One-time owner-authorized test-data purge. Verified hosted targets only.
-- Run all statements in ONE transaction. Only named immutable guards are suspended, transactionally.
BEGIN;
set local lock_timeout='5s';

set local statement_timeout='30s';

do $guard$ begin
 if current_database()<>'himmah_futsal' or current_user<>'himmah_owner' then raise exception 'Wrong database/role'; end if;
 perform pg_advisory_xact_lock(hashtext('himmah-test-cleanup-20261030'));
 end $guard$;

lock table public.hub_cash_allocation_corrections,public.hub_cash_reversals,public.hub_cash_allocations,public.hub_cash_requests,public.hub_cash_receipts,public.hub_billing_requests,public.hub_session_operations,public.hub_registration_charges,public.hub_session_registration_events,public.hub_session_registration_requests,public.hub_session_expected_contacts,public.hub_session_registration_settings,public.hub_session_registrations,public.hub_attendance_changes,public.hub_attendance,public.hub_attendance_requests,public.hub_volunteer_assignment_changes,public.hub_volunteer_assignments,public.hub_push_deliveries,public.hub_notifications,public.hub_directory_audit,public.hub_activity_sessions,public.hub_activities in access exclusive mode;

create temporary table cleanup_activities on commit drop as select organization_id,id,name from public.hub_activities where organization_id='58699424-738a-43a2-949e-884624695c82' and id in ('7cd676a0-6eb0-4ca2-9ce9-3e5f40d1c72a','8e5702f2-33d0-4c97-acac-ff7ab5a4a6b1','d08816db-fbf2-4264-aea1-19222acc736c');

do $guard$ begin
 if (select count(*) from cleanup_activities)<>3 or exists(select 1 from cleanup_activities where name not ilike '%test%') then raise exception 'Reviewed test activity set changed'; end if;
 if exists(select 1 from hub_activities where name ilike '%test%' and not exists(select 1 from cleanup_activities t where t.id=hub_activities.id and t.organization_id=hub_activities.organization_id)) then raise exception 'Unexpected matching activity; review scope'; end if;
 end $guard$;

create temporary table cleanup_sessions on commit drop as select s.organization_id,s.id from hub_activity_sessions s join cleanup_activities a on a.organization_id=s.organization_id and a.id=s.activity_id;

create temporary table cleanup_refs(organization_id uuid,id text,kind text) on commit drop;

insert into cleanup_refs select r.organization_id,r.id::text,'activity' from public.hub_activities r where exists(select 1 from cleanup_activities t where t.id=r.id and t.organization_id=r.organization_id);

insert into cleanup_refs select r.organization_id,r.id::text,'session' from public.hub_activity_sessions r where exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id);

insert into cleanup_refs select r.organization_id,r.id::text,'receipt' from public.hub_cash_receipts r where exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id);

insert into cleanup_refs select r.organization_id,r.id::text,'charge' from public.hub_registration_charges r where exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id);

insert into cleanup_refs select r.organization_id,r.id::text,'registration' from public.hub_session_registrations r where exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id);

insert into cleanup_refs select r.organization_id,r.id::text,'attendance-event' from public.hub_attendance_changes r where exists(select 1 from cleanup_sessions t where t.organization_id=r.organization_id and t.id=r.session_id);

insert into cleanup_refs select r.organization_id,r.id::text,'attendance-request' from public.hub_attendance_requests r where exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id);

insert into cleanup_refs select r.organization_id,r.id::text,'registration-event' from public.hub_session_registration_events r where exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id);

insert into cleanup_refs select r.organization_id,r.id::text,'assignment' from public.hub_volunteer_assignments r where exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id);

insert into cleanup_refs select r.organization_id,r.id::text,'assignment-event' from public.hub_volunteer_assignment_changes r where exists(select 1 from cleanup_refs t where t.organization_id=r.organization_id and t.kind='assignment' and t.id=r.assignment_id::text);

insert into cleanup_refs select r.organization_id,r.id::text,'audit' from hub_directory_audit r where exists(select 1 from cleanup_refs t where t.organization_id=r.organization_id and t.id=r.entity_id);

create temporary table cleanup_notifications on commit drop as select n.id from hub_notifications n where exists(select 1 from cleanup_refs t where t.organization_id=n.organization_id and t.id=n.event_id::text) or exists(select 1 from cleanup_activities a where a.organization_id=n.organization_id and n.href ~ ('^/workspace/'||a.organization_id||'/activities/'||a.id||'([/?#]|$)'));

do $guard$ begin
 if exists(select 1 from hub_cash_allocations ca join hub_cash_receipts cr on cr.organization_id=ca.organization_id and cr.id=ca.receipt_id join hub_registration_charges ch on ch.organization_id=ca.organization_id and ch.id=ca.charge_id where (exists(select 1 from cleanup_activities t where t.organization_id=cr.organization_id and t.id=cr.activity_id)) <> (exists(select 1 from cleanup_activities t where t.organization_id=ch.organization_id and t.id=ch.activity_id))) then raise exception 'Financial relationship crosses cleanup boundary'; end if;
 end $guard$;

create temporary table cleanup_counts(table_name text primary key,deleted bigint,remaining bigint) on commit drop;

create temporary table cleanup_rules(table_name text primary key,predicate text) on commit drop;

insert into cleanup_rules values ('hub_cash_allocation_corrections',$rule$exists(select 1 from cleanup_refs t where t.organization_id=r.organization_id and t.kind='receipt' and t.id=r.receipt_id::text)$rule$);

insert into cleanup_rules values ('hub_cash_reversals',$rule$exists(select 1 from cleanup_refs t where t.organization_id=r.organization_id and t.kind='receipt' and t.id=r.receipt_id::text)$rule$);

insert into cleanup_rules values ('hub_cash_allocations',$rule$exists(select 1 from cleanup_refs t where t.organization_id=r.organization_id and t.kind='receipt' and t.id=r.receipt_id::text)$rule$);

insert into cleanup_rules values ('hub_cash_requests',$rule$exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id)$rule$);

insert into cleanup_rules values ('hub_cash_receipts',$rule$exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id)$rule$);

insert into cleanup_rules values ('hub_billing_requests',$rule$exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id)$rule$);

insert into cleanup_rules values ('hub_session_operations',$rule$exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id)$rule$);

insert into cleanup_rules values ('hub_registration_charges',$rule$exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id)$rule$);

insert into cleanup_rules values ('hub_session_registration_events',$rule$exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id)$rule$);

insert into cleanup_rules values ('hub_session_registration_requests',$rule$exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id)$rule$);

insert into cleanup_rules values ('hub_session_expected_contacts',$rule$exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id)$rule$);

insert into cleanup_rules values ('hub_session_registration_settings',$rule$exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id)$rule$);

insert into cleanup_rules values ('hub_session_registrations',$rule$exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id)$rule$);

insert into cleanup_rules values ('hub_attendance_changes',$rule$exists(select 1 from cleanup_sessions t where t.organization_id=r.organization_id and t.id=r.session_id)$rule$);

insert into cleanup_rules values ('hub_attendance',$rule$exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id)$rule$);

insert into cleanup_rules values ('hub_attendance_requests',$rule$exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id)$rule$);

insert into cleanup_rules values ('hub_volunteer_assignment_changes',$rule$exists(select 1 from cleanup_refs t where t.organization_id=r.organization_id and t.kind='assignment' and t.id=r.assignment_id::text)$rule$);

insert into cleanup_rules values ('hub_volunteer_assignments',$rule$exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id)$rule$);

insert into cleanup_rules values ('hub_push_deliveries',$rule$exists(select 1 from cleanup_notifications t where t.id=r.notification_id)$rule$);

insert into cleanup_rules values ('hub_notifications',$rule$exists(select 1 from cleanup_notifications t where t.id=r.id)$rule$);

insert into cleanup_rules values ('hub_directory_audit',$rule$exists(select 1 from cleanup_refs t where t.organization_id=r.organization_id and t.id=r.entity_id)$rule$);

insert into cleanup_rules values ('hub_activity_sessions',$rule$exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id)$rule$);

insert into cleanup_rules values ('hub_activities',$rule$exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.id)$rule$);

create temporary table cleanup_triggers on commit drop as select t.tgrelid,t.tgname,t.tgenabled from pg_trigger t join cleanup_rules r on t.tgrelid=('public.'||r.table_name)::regclass where not t.tgisinternal;

create temporary table cleanup_preserved(table_name text primary key,digest text) on commit drop;

do $snapshot$ declare r record; d text; begin
 for r in select * from cleanup_rules loop
 execute format('select md5(coalesce(string_agg(to_jsonb(r)::text,'''' order by to_jsonb(r)::text),'''')) from public.%I r where not (%s)',r.table_name,r.predicate) into d;
 insert into cleanup_preserved values(r.table_name,d);
 end loop;
 end $snapshot$;

do $guard$ begin if not exists(select 1 from pg_trigger where tgrelid='public.hub_attendance_changes'::regclass and tgname='hub_attendance_history_immutable' and tgenabled='O') then raise exception 'Unexpected immutable trigger state'; end if; end $guard$;

alter table public.hub_attendance_changes disable trigger hub_attendance_history_immutable;

do $guard$ begin if not exists(select 1 from pg_trigger where tgrelid='public.hub_billing_requests'::regclass and tgname='hub_billing_request_immutable' and tgenabled='O') then raise exception 'Unexpected immutable trigger state'; end if; end $guard$;

alter table public.hub_billing_requests disable trigger hub_billing_request_immutable;

do $guard$ begin if not exists(select 1 from pg_trigger where tgrelid='public.hub_cash_allocation_corrections'::regclass and tgname='hub_cash_correction_immutable' and tgenabled='O') then raise exception 'Unexpected immutable trigger state'; end if; end $guard$;

alter table public.hub_cash_allocation_corrections disable trigger hub_cash_correction_immutable;

do $guard$ begin if not exists(select 1 from pg_trigger where tgrelid='public.hub_cash_allocations'::regclass and tgname='hub_cash_allocation_immutable' and tgenabled='O') then raise exception 'Unexpected immutable trigger state'; end if; end $guard$;

alter table public.hub_cash_allocations disable trigger hub_cash_allocation_immutable;

do $guard$ begin if not exists(select 1 from pg_trigger where tgrelid='public.hub_cash_receipts'::regclass and tgname='hub_cash_receipt_immutable' and tgenabled='O') then raise exception 'Unexpected immutable trigger state'; end if; end $guard$;

alter table public.hub_cash_receipts disable trigger hub_cash_receipt_immutable;

do $guard$ begin if not exists(select 1 from pg_trigger where tgrelid='public.hub_cash_requests'::regclass and tgname='hub_cash_request_immutable' and tgenabled='O') then raise exception 'Unexpected immutable trigger state'; end if; end $guard$;

alter table public.hub_cash_requests disable trigger hub_cash_request_immutable;

do $guard$ begin if not exists(select 1 from pg_trigger where tgrelid='public.hub_cash_reversals'::regclass and tgname='hub_cash_reversal_immutable' and tgenabled='O') then raise exception 'Unexpected immutable trigger state'; end if; end $guard$;

alter table public.hub_cash_reversals disable trigger hub_cash_reversal_immutable;

do $guard$ begin if not exists(select 1 from pg_trigger where tgrelid='public.hub_registration_charges'::regclass and tgname='hub_charge_immutable' and tgenabled='O') then raise exception 'Unexpected immutable trigger state'; end if; end $guard$;

alter table public.hub_registration_charges disable trigger hub_charge_immutable;

do $guard$ begin if not exists(select 1 from pg_trigger where tgrelid='public.hub_session_operations'::regclass and tgname='hub_participant_operation_immutable' and tgenabled='O') then raise exception 'Unexpected immutable trigger state'; end if; end $guard$;

alter table public.hub_session_operations disable trigger hub_participant_operation_immutable;

do $guard$ begin if not exists(select 1 from pg_trigger where tgrelid='public.hub_session_registration_events'::regclass and tgname='hub_registration_events_immutable' and tgenabled='O') then raise exception 'Unexpected immutable trigger state'; end if; end $guard$;

alter table public.hub_session_registration_events disable trigger hub_registration_events_immutable;

do $guard$ begin if not exists(select 1 from pg_trigger where tgrelid='public.hub_session_registration_requests'::regclass and tgname='hub_registration_requests_immutable' and tgenabled='O') then raise exception 'Unexpected immutable trigger state'; end if; end $guard$;

alter table public.hub_session_registration_requests disable trigger hub_registration_requests_immutable;

do $guard$ begin if not exists(select 1 from pg_trigger where tgrelid='public.hub_volunteer_assignment_changes'::regclass and tgname='hub_access_history_immutable' and tgenabled='O') then raise exception 'Unexpected immutable trigger state'; end if; end $guard$;

alter table public.hub_volunteer_assignment_changes disable trigger hub_access_history_immutable;

with removed as (delete from public.hub_cash_allocation_corrections r where exists(select 1 from cleanup_refs t where t.organization_id=r.organization_id and t.kind='receipt' and t.id=r.receipt_id::text) returning 1) insert into cleanup_counts select 'hub_cash_allocation_corrections',count(*),(select count(*) from public.hub_cash_allocation_corrections r where not (exists(select 1 from cleanup_refs t where t.organization_id=r.organization_id and t.kind='receipt' and t.id=r.receipt_id::text))) from removed;

with removed as (delete from public.hub_cash_reversals r where exists(select 1 from cleanup_refs t where t.organization_id=r.organization_id and t.kind='receipt' and t.id=r.receipt_id::text) returning 1) insert into cleanup_counts select 'hub_cash_reversals',count(*),(select count(*) from public.hub_cash_reversals r where not (exists(select 1 from cleanup_refs t where t.organization_id=r.organization_id and t.kind='receipt' and t.id=r.receipt_id::text))) from removed;

with removed as (delete from public.hub_cash_allocations r where exists(select 1 from cleanup_refs t where t.organization_id=r.organization_id and t.kind='receipt' and t.id=r.receipt_id::text) returning 1) insert into cleanup_counts select 'hub_cash_allocations',count(*),(select count(*) from public.hub_cash_allocations r where not (exists(select 1 from cleanup_refs t where t.organization_id=r.organization_id and t.kind='receipt' and t.id=r.receipt_id::text))) from removed;

with removed as (delete from public.hub_cash_requests r where exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id) returning 1) insert into cleanup_counts select 'hub_cash_requests',count(*),(select count(*) from public.hub_cash_requests r where not (exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id))) from removed;

with removed as (delete from public.hub_cash_receipts r where exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id) returning 1) insert into cleanup_counts select 'hub_cash_receipts',count(*),(select count(*) from public.hub_cash_receipts r where not (exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id))) from removed;

with removed as (delete from public.hub_billing_requests r where exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id) returning 1) insert into cleanup_counts select 'hub_billing_requests',count(*),(select count(*) from public.hub_billing_requests r where not (exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id))) from removed;

with removed as (delete from public.hub_session_operations r where exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id) returning 1) insert into cleanup_counts select 'hub_session_operations',count(*),(select count(*) from public.hub_session_operations r where not (exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id))) from removed;

with removed as (delete from public.hub_registration_charges r where exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id) returning 1) insert into cleanup_counts select 'hub_registration_charges',count(*),(select count(*) from public.hub_registration_charges r where not (exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id))) from removed;

with removed as (delete from public.hub_session_registration_events r where exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id) returning 1) insert into cleanup_counts select 'hub_session_registration_events',count(*),(select count(*) from public.hub_session_registration_events r where not (exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id))) from removed;

with removed as (delete from public.hub_session_registration_requests r where exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id) returning 1) insert into cleanup_counts select 'hub_session_registration_requests',count(*),(select count(*) from public.hub_session_registration_requests r where not (exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id))) from removed;

with removed as (delete from public.hub_session_expected_contacts r where exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id) returning 1) insert into cleanup_counts select 'hub_session_expected_contacts',count(*),(select count(*) from public.hub_session_expected_contacts r where not (exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id))) from removed;

with removed as (delete from public.hub_session_registration_settings r where exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id) returning 1) insert into cleanup_counts select 'hub_session_registration_settings',count(*),(select count(*) from public.hub_session_registration_settings r where not (exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id))) from removed;

with removed as (delete from public.hub_session_registrations r where exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id) returning 1) insert into cleanup_counts select 'hub_session_registrations',count(*),(select count(*) from public.hub_session_registrations r where not (exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id))) from removed;

with removed as (delete from public.hub_attendance_changes r where exists(select 1 from cleanup_sessions t where t.organization_id=r.organization_id and t.id=r.session_id) returning 1) insert into cleanup_counts select 'hub_attendance_changes',count(*),(select count(*) from public.hub_attendance_changes r where not (exists(select 1 from cleanup_sessions t where t.organization_id=r.organization_id and t.id=r.session_id))) from removed;

with removed as (delete from public.hub_attendance r where exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id) returning 1) insert into cleanup_counts select 'hub_attendance',count(*),(select count(*) from public.hub_attendance r where not (exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id))) from removed;

with removed as (delete from public.hub_attendance_requests r where exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id) returning 1) insert into cleanup_counts select 'hub_attendance_requests',count(*),(select count(*) from public.hub_attendance_requests r where not (exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id))) from removed;

with removed as (delete from public.hub_volunteer_assignment_changes r where exists(select 1 from cleanup_refs t where t.organization_id=r.organization_id and t.kind='assignment' and t.id=r.assignment_id::text) returning 1) insert into cleanup_counts select 'hub_volunteer_assignment_changes',count(*),(select count(*) from public.hub_volunteer_assignment_changes r where not (exists(select 1 from cleanup_refs t where t.organization_id=r.organization_id and t.kind='assignment' and t.id=r.assignment_id::text))) from removed;

with removed as (delete from public.hub_volunteer_assignments r where exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id) returning 1) insert into cleanup_counts select 'hub_volunteer_assignments',count(*),(select count(*) from public.hub_volunteer_assignments r where not (exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id))) from removed;

with removed as (delete from public.hub_push_deliveries r where exists(select 1 from cleanup_notifications t where t.id=r.notification_id) returning 1) insert into cleanup_counts select 'hub_push_deliveries',count(*),(select count(*) from public.hub_push_deliveries r where not (exists(select 1 from cleanup_notifications t where t.id=r.notification_id))) from removed;

with removed as (delete from public.hub_notifications r where exists(select 1 from cleanup_notifications t where t.id=r.id) returning 1) insert into cleanup_counts select 'hub_notifications',count(*),(select count(*) from public.hub_notifications r where not (exists(select 1 from cleanup_notifications t where t.id=r.id))) from removed;

with removed as (delete from public.hub_directory_audit r where exists(select 1 from cleanup_refs t where t.organization_id=r.organization_id and t.id=r.entity_id) returning 1) insert into cleanup_counts select 'hub_directory_audit',count(*),(select count(*) from public.hub_directory_audit r where not (exists(select 1 from cleanup_refs t where t.organization_id=r.organization_id and t.id=r.entity_id))) from removed;

with removed as (delete from public.hub_activity_sessions r where exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id) returning 1) insert into cleanup_counts select 'hub_activity_sessions',count(*),(select count(*) from public.hub_activity_sessions r where not (exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.activity_id))) from removed;

with removed as (delete from public.hub_activities r where exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.id) returning 1) insert into cleanup_counts select 'hub_activities',count(*),(select count(*) from public.hub_activities r where not (exists(select 1 from cleanup_activities t where t.organization_id=r.organization_id and t.id=r.id))) from removed;

alter table public.hub_attendance_changes enable trigger hub_attendance_history_immutable;

alter table public.hub_billing_requests enable trigger hub_billing_request_immutable;

alter table public.hub_cash_allocation_corrections enable trigger hub_cash_correction_immutable;

alter table public.hub_cash_allocations enable trigger hub_cash_allocation_immutable;

alter table public.hub_cash_receipts enable trigger hub_cash_receipt_immutable;

alter table public.hub_cash_requests enable trigger hub_cash_request_immutable;

alter table public.hub_cash_reversals enable trigger hub_cash_reversal_immutable;

alter table public.hub_registration_charges enable trigger hub_charge_immutable;

alter table public.hub_session_operations enable trigger hub_participant_operation_immutable;

alter table public.hub_session_registration_events enable trigger hub_registration_events_immutable;

alter table public.hub_session_registration_requests enable trigger hub_registration_requests_immutable;

alter table public.hub_volunteer_assignment_changes enable trigger hub_access_history_immutable;

do $verify$ declare r record; d text; begin
 for r in select * from cleanup_rules loop
 execute format('select md5(coalesce(string_agg(to_jsonb(r)::text,'''' order by to_jsonb(r)::text),'''')) from public.%I r',r.table_name) into d;
 if d is distinct from (select digest from cleanup_preserved where table_name=r.table_name) then raise exception 'Unrelated rows changed in %',r.table_name; end if;
 end loop;
 if exists(select 1 from cleanup_triggers before join pg_trigger after on before.tgrelid=after.tgrelid and before.tgname=after.tgname where before.tgenabled<>after.tgenabled) then raise exception 'Trigger states changed'; end if;
 if exists(select 1 from hub_activities where name ilike '%test%') then raise exception 'Matching activities remain'; end if;
 end $verify$;

select * from cleanup_counts order by table_name;
COMMIT;

-- Permanent activity deletion is an explicit administrator operation, separate from archive.
-- No trigger is disabled; immutable history permits only rows in the authorized transaction-local scope.
CREATE OR REPLACE FUNCTION hub_activity_deletion_scope(p_org uuid,p_activity uuid) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE ctx jsonb; entities jsonb;
BEGIN
 SELECT jsonb_build_object('org',p_org,'activity',p_activity,
 'sessions',coalesce((select jsonb_agg(id::text) from hub_activity_sessions where organization_id=p_org and activity_id=p_activity),'[]'),
 'receipts',coalesce((select jsonb_agg(id::text) from hub_cash_receipts where organization_id=p_org and activity_id=p_activity),'[]'),
 'assignments',coalesce((select jsonb_agg(id::text) from hub_volunteer_assignments where organization_id=p_org and activity_id=p_activity),'[]')) INTO ctx;
 SELECT coalesce(jsonb_agg(id),'[]') INTO entities FROM (
 SELECT p_activity::text id UNION SELECT id::text FROM hub_activity_sessions WHERE organization_id=p_org AND activity_id=p_activity
 UNION SELECT id::text FROM hub_cash_receipts WHERE organization_id=p_org AND activity_id=p_activity
 UNION SELECT id::text FROM hub_registration_charges WHERE organization_id=p_org AND activity_id=p_activity
 UNION SELECT id::text FROM hub_session_registrations WHERE organization_id=p_org AND activity_id=p_activity
 UNION SELECT id::text FROM hub_session_registration_events WHERE organization_id=p_org AND activity_id=p_activity
 UNION SELECT id::text FROM hub_attendance_requests WHERE organization_id=p_org AND activity_id=p_activity
 UNION SELECT id::text FROM hub_attendance_changes WHERE organization_id=p_org AND ctx->'sessions' ? session_id::text
 UNION SELECT id::text FROM hub_volunteer_assignments WHERE organization_id=p_org AND activity_id=p_activity
 UNION SELECT id::text FROM hub_volunteer_assignment_changes WHERE organization_id=p_org AND ctx->'assignments' ? assignment_id::text
 ) refs;
 ctx:=ctx||jsonb_build_object('entities',entities);
 SELECT entities||coalesce(jsonb_agg(id::text),'[]') INTO entities FROM hub_directory_audit WHERE organization_id=p_org AND entities ? entity_id;
 ctx:=ctx||jsonb_build_object('entities',entities);
 RETURN ctx||jsonb_build_object('notifications',coalesce((select jsonb_agg(id::text) from hub_notifications where organization_id=p_org and (entities ? event_id::text or href ~ ('^/workspace/'||p_org||'/activities/'||p_activity||'([/?#]|$)'))),'[]'));
END $$;

CREATE OR REPLACE FUNCTION hub_activity_deletion_matches(p_table text,r jsonb,ctx jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
 IF p_table='hub_push_deliveries' THEN RETURN ctx->'notifications' ? (r->>'notification_id'); END IF;
 IF r->>'organization_id' IS DISTINCT FROM ctx->>'org' THEN RETURN false; END IF;
 CASE p_table
 WHEN 'hub_cash_allocation_corrections' THEN RETURN ctx->'receipts' ? (r->>'receipt_id');
 WHEN 'hub_cash_reversals' THEN RETURN ctx->'receipts' ? (r->>'receipt_id');
 WHEN 'hub_cash_allocations' THEN RETURN ctx->'receipts' ? (r->>'receipt_id');
 WHEN 'hub_cash_requests' THEN RETURN r->>'activity_id'=ctx->>'activity';
 WHEN 'hub_cash_receipts' THEN RETURN r->>'activity_id'=ctx->>'activity';
 WHEN 'hub_billing_requests' THEN RETURN r->>'activity_id'=ctx->>'activity';
 WHEN 'hub_session_operations' THEN RETURN r->>'activity_id'=ctx->>'activity';
 WHEN 'hub_registration_charges' THEN RETURN r->>'activity_id'=ctx->>'activity';
 WHEN 'hub_session_registration_events' THEN RETURN r->>'activity_id'=ctx->>'activity';
 WHEN 'hub_session_registration_requests' THEN RETURN r->>'activity_id'=ctx->>'activity';
 WHEN 'hub_session_expected_contacts' THEN RETURN r->>'activity_id'=ctx->>'activity';
 WHEN 'hub_session_registration_settings' THEN RETURN r->>'activity_id'=ctx->>'activity';
 WHEN 'hub_session_registrations' THEN RETURN r->>'activity_id'=ctx->>'activity';
 WHEN 'hub_attendance_changes' THEN RETURN ctx->'sessions' ? (r->>'session_id');
 WHEN 'hub_attendance' THEN RETURN r->>'activity_id'=ctx->>'activity';
 WHEN 'hub_attendance_requests' THEN RETURN r->>'activity_id'=ctx->>'activity';
 WHEN 'hub_volunteer_assignment_changes' THEN RETURN ctx->'assignments' ? (r->>'assignment_id');
 WHEN 'hub_volunteer_assignments' THEN RETURN r->>'activity_id'=ctx->>'activity';
 WHEN 'hub_notifications' THEN RETURN ctx->'notifications' ? (r->>'id');
 WHEN 'hub_directory_audit' THEN RETURN ctx->'entities' ? (r->>'entity_id');
 WHEN 'hub_activity_sessions' THEN RETURN r->>'activity_id'=ctx->>'activity';
 WHEN 'hub_activities' THEN RETURN r->>'id'=ctx->>'activity';
 ELSE RETURN false;
 END CASE;
END $$;

CREATE OR REPLACE FUNCTION hub_activity_deletion_filter(p_table text) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
 CASE p_table
 WHEN 'hub_push_deliveries' THEN RETURN $filter$r.notification_id=any(array(select value::uuid from jsonb_array_elements_text($1->'notifications')))$filter$;
 WHEN 'hub_cash_allocation_corrections' THEN RETURN $filter$r.organization_id=($1->>'org')::uuid and r.receipt_id=any(array(select value::uuid from jsonb_array_elements_text($1->'receipts')))$filter$;
 WHEN 'hub_cash_reversals' THEN RETURN $filter$r.organization_id=($1->>'org')::uuid and r.receipt_id=any(array(select value::uuid from jsonb_array_elements_text($1->'receipts')))$filter$;
 WHEN 'hub_cash_allocations' THEN RETURN $filter$r.organization_id=($1->>'org')::uuid and r.receipt_id=any(array(select value::uuid from jsonb_array_elements_text($1->'receipts')))$filter$;
 WHEN 'hub_cash_requests' THEN RETURN $filter$r.organization_id=($1->>'org')::uuid and r.activity_id=($1->>'activity')::uuid$filter$;
 WHEN 'hub_cash_receipts' THEN RETURN $filter$r.organization_id=($1->>'org')::uuid and r.activity_id=($1->>'activity')::uuid$filter$;
 WHEN 'hub_billing_requests' THEN RETURN $filter$r.organization_id=($1->>'org')::uuid and r.activity_id=($1->>'activity')::uuid$filter$;
 WHEN 'hub_session_operations' THEN RETURN $filter$r.organization_id=($1->>'org')::uuid and r.activity_id=($1->>'activity')::uuid$filter$;
 WHEN 'hub_registration_charges' THEN RETURN $filter$r.organization_id=($1->>'org')::uuid and r.activity_id=($1->>'activity')::uuid$filter$;
 WHEN 'hub_session_registration_events' THEN RETURN $filter$r.organization_id=($1->>'org')::uuid and r.activity_id=($1->>'activity')::uuid$filter$;
 WHEN 'hub_session_registration_requests' THEN RETURN $filter$r.organization_id=($1->>'org')::uuid and r.activity_id=($1->>'activity')::uuid$filter$;
 WHEN 'hub_session_expected_contacts' THEN RETURN $filter$r.organization_id=($1->>'org')::uuid and r.activity_id=($1->>'activity')::uuid$filter$;
 WHEN 'hub_session_registration_settings' THEN RETURN $filter$r.organization_id=($1->>'org')::uuid and r.activity_id=($1->>'activity')::uuid$filter$;
 WHEN 'hub_session_registrations' THEN RETURN $filter$r.organization_id=($1->>'org')::uuid and r.activity_id=($1->>'activity')::uuid$filter$;
 WHEN 'hub_attendance_changes' THEN RETURN $filter$r.organization_id=($1->>'org')::uuid and r.session_id=any(array(select value::uuid from jsonb_array_elements_text($1->'sessions')))$filter$;
 WHEN 'hub_attendance' THEN RETURN $filter$r.organization_id=($1->>'org')::uuid and r.activity_id=($1->>'activity')::uuid$filter$;
 WHEN 'hub_attendance_requests' THEN RETURN $filter$r.organization_id=($1->>'org')::uuid and r.activity_id=($1->>'activity')::uuid$filter$;
 WHEN 'hub_volunteer_assignment_changes' THEN RETURN $filter$r.organization_id=($1->>'org')::uuid and r.assignment_id=any(array(select value::uuid from jsonb_array_elements_text($1->'assignments')))$filter$;
 WHEN 'hub_volunteer_assignments' THEN RETURN $filter$r.organization_id=($1->>'org')::uuid and r.activity_id=($1->>'activity')::uuid$filter$;
 WHEN 'hub_notifications' THEN RETURN $filter$r.organization_id=($1->>'org')::uuid and r.id=any(array(select value::uuid from jsonb_array_elements_text($1->'notifications')))$filter$;
 WHEN 'hub_directory_audit' THEN RETURN $filter$r.organization_id=($1->>'org')::uuid and r.entity_id=any(array(select value::text from jsonb_array_elements_text($1->'entities')))$filter$;
 WHEN 'hub_activity_sessions' THEN RETURN $filter$r.organization_id=($1->>'org')::uuid and r.activity_id=($1->>'activity')::uuid$filter$;
 WHEN 'hub_activities' THEN RETURN $filter$r.organization_id=($1->>'org')::uuid and r.id=($1->>'activity')::uuid$filter$;
 ELSE RAISE EXCEPTION 'Unknown deletion table';
 END CASE;
END $$;

CREATE OR REPLACE FUNCTION hub_activity_deletion_preview(p_actor text,p_org uuid,p_activity uuid) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE ctx jsonb; t text; digests jsonb:='{}'; d text; a hub_activities%ROWTYPE;
BEGIN
 IF NOT hub_is_admin(p_actor,p_org) THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 SELECT * INTO a FROM hub_activities WHERE organization_id=p_org AND id=p_activity;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 ctx:=hub_activity_deletion_scope(p_org,p_activity);
 FOREACH t IN ARRAY ARRAY['hub_cash_allocation_corrections','hub_cash_reversals','hub_cash_allocations','hub_cash_requests','hub_cash_receipts','hub_billing_requests','hub_session_operations','hub_registration_charges','hub_session_registration_events','hub_session_registration_requests','hub_session_expected_contacts','hub_session_registration_settings','hub_session_registrations','hub_attendance_changes','hub_attendance','hub_attendance_requests','hub_volunteer_assignment_changes','hub_volunteer_assignments','hub_push_deliveries','hub_notifications','hub_directory_audit','hub_activity_sessions','hub_activities'] LOOP
 EXECUTE format($query$select md5(coalesce(string_agg(to_jsonb(r)::text,'' order by to_jsonb(r)::text),'')) from public.%I r where %s$query$,t,hub_activity_deletion_filter(t)) INTO d USING ctx;
 digests:=digests||jsonb_build_object(t,d);
 END LOOP;
 RETURN jsonb_build_object('snapshot',md5(digests::text),'name',a.name,
 'sessions',jsonb_array_length(ctx->'sessions'),'attendance',(select count(*) from hub_attendance where organization_id=p_org and activity_id=p_activity),
 'charges',(select count(*) from hub_registration_charges where organization_id=p_org and activity_id=p_activity),'receipts',jsonb_array_length(ctx->'receipts'));
END $$;

CREATE OR REPLACE FUNCTION hub_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ctx jsonb;
BEGIN
 IF TG_OP='DELETE' AND nullif(current_setting('himmah.activity_deletion',true),'') IS NOT NULL THEN
 ctx:=current_setting('himmah.activity_deletion')::jsonb;
 IF hub_is_admin(ctx->>'actor',(ctx->>'org')::uuid)
 AND EXISTS(select 1 from hub_activities where organization_id=(ctx->>'org')::uuid and id=(ctx->>'activity')::uuid)
 AND hub_activity_deletion_matches(TG_TABLE_NAME,to_jsonb(OLD),ctx) THEN RETURN OLD; END IF;
 END IF;
 RAISE EXCEPTION 'History is immutable';
END $$;

CREATE OR REPLACE FUNCTION hub_delete_activity(p_actor text,p_org uuid,p_activity uuid,p_key uuid,p_snapshot text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE ctx jsonb; preview jsonb; prior hub_directory_audit%ROWTYPE; t text; old_context text;
BEGIN
 -- Check current access before every replay; membership and session locks match operational command boundaries.
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin') FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 IF p_snapshot IS NULL OR p_snapshot !~ '^[a-f0-9]{32}$' THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('activity-delete:'||p_org||':'||p_key,0));
 SELECT * INTO prior FROM hub_directory_audit WHERE id=p_key;
 IF FOUND THEN
 IF prior.organization_id=p_org AND prior.actor_id=p_actor AND prior.entity_id=p_activity::text AND prior.action='activity.delete:'||p_snapshot THEN RETURN jsonb_build_object('deleted',true); END IF;
 RETURN jsonb_build_object('code','conflict');
 END IF;
 PERFORM 1 FROM hub_activities WHERE organization_id=p_org AND id=p_activity FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 PERFORM 1 FROM hub_activity_sessions WHERE organization_id=p_org AND activity_id=p_activity ORDER BY id FOR UPDATE;
 preview:=hub_activity_deletion_preview(p_actor,p_org,p_activity);
 IF preview->>'snapshot' IS DISTINCT FROM p_snapshot THEN RETURN jsonb_build_object('code','conflict'); END IF;
 -- Never silently erase a financial allocation belonging to another activity.
 IF EXISTS(select 1 from hub_cash_allocations ca join hub_cash_receipts cr on cr.organization_id=ca.organization_id and cr.id=ca.receipt_id join hub_registration_charges ch on ch.organization_id=ca.organization_id and ch.id=ca.charge_id where ca.organization_id=p_org and (cr.activity_id=p_activity)<>(ch.activity_id=p_activity)) THEN RETURN jsonb_build_object('code','conflict'); END IF;
 ctx:=hub_activity_deletion_scope(p_org,p_activity)||jsonb_build_object('actor',p_actor);
 old_context:=current_setting('himmah.activity_deletion',true);
 PERFORM set_config('himmah.activity_deletion',ctx::text,true);
 FOREACH t IN ARRAY ARRAY['hub_cash_allocation_corrections','hub_cash_reversals','hub_cash_allocations','hub_cash_requests','hub_cash_receipts','hub_billing_requests','hub_session_operations','hub_registration_charges','hub_session_registration_events','hub_session_registration_requests','hub_session_expected_contacts','hub_session_registration_settings','hub_session_registrations','hub_attendance_changes','hub_attendance','hub_attendance_requests','hub_volunteer_assignment_changes','hub_volunteer_assignments','hub_push_deliveries','hub_notifications','hub_directory_audit','hub_activity_sessions','hub_activities'] LOOP
 EXECUTE format('delete from public.%I r where %s',t,hub_activity_deletion_filter(t)) USING ctx;
 END LOOP;
 PERFORM set_config('himmah.activity_deletion',coalesce(old_context,''),true);
 -- Minimal non-financial deletion receipt: request identity and snapshot hash, no participant/payment payload.
 INSERT INTO hub_directory_audit(id,organization_id,actor_id,action,entity_id) VALUES(p_key,p_org,p_actor,'activity.delete:'||p_snapshot,p_activity::text);
 RETURN jsonb_build_object('deleted',true);
END $$;

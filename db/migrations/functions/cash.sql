CREATE OR REPLACE FUNCTION hub_save_access(p_actor text,p_org uuid,p_id uuid,p_key uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_old hub_volunteer_assignments%ROWTYPE;v_new hub_volunteer_assignments%ROWTYPE;v_role text;v_name text;v_scope text;v_group uuid;v_activity uuid;
BEGIN
 PERFORM 1 FROM hub_organizations WHERE id=p_org FOR NO KEY UPDATE;
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin') FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 IF p_payload->>'action' IS DISTINCT FROM 'revoke' AND NOT (coalesce((p_payload->>'canAttend')::boolean,false) OR coalesce((p_payload->>'canCollect')::boolean,false)) THEN RETURN jsonb_build_object('code','access_capabilities'); END IF;
 IF p_id IS NULL THEN
  SELECT * INTO v_old FROM hub_volunteer_assignments WHERE organization_id=p_org AND creation_key=p_key;
  IF FOUND THEN IF v_old.created_by<>p_actor OR v_old.user_id IS DISTINCT FROM p_payload->>'userId' OR v_old.group_id IS DISTINCT FROM (p_payload->>'groupId')::uuid OR v_old.activity_id IS DISTINCT FROM (p_payload->>'activityId')::uuid OR v_old.can_attend IS DISTINCT FROM (p_payload->>'canAttend')::boolean OR v_old.can_collect IS DISTINCT FROM coalesce((p_payload->>'canCollect')::boolean,false) THEN RETURN jsonb_build_object('code','conflict'); END IF; RETURN jsonb_build_object('id',v_old.id); END IF;
  SELECT role,coalesce(display_name,'') INTO v_role,v_name FROM hub_memberships WHERE organization_id=p_org AND user_id=p_payload->>'userId' FOR UPDATE;
  IF v_role IS DISTINCT FROM 'volunteer' THEN RETURN jsonb_build_object('code','access_volunteer'); END IF;
  v_group := (p_payload->>'groupId')::uuid; v_activity := (p_payload->>'activityId')::uuid;
  IF (v_group IS NULL)=(v_activity IS NULL) THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
  IF v_group IS NOT NULL THEN SELECT name INTO v_scope FROM himmah.activity_groups WHERE organization_id=p_org AND id=v_group AND NOT archived FOR SHARE;
  ELSE SELECT name INTO v_scope FROM hub_activities WHERE organization_id=p_org AND id=v_activity AND NOT cancelled FOR SHARE; END IF;
  IF v_scope IS NULL THEN RETURN jsonb_build_object('code','not_found'); END IF;
  INSERT INTO hub_volunteer_assignments(organization_id,user_id,staff_name,group_id,activity_id,scope_name,can_attend,can_collect,created_by,creation_key)
  VALUES(p_org,p_payload->>'userId',v_name,v_group,v_activity,v_scope,(p_payload->>'canAttend')::boolean,coalesce((p_payload->>'canCollect')::boolean,false),p_actor,p_key) RETURNING * INTO v_new;
 ELSE
  SELECT * INTO v_old FROM hub_volunteer_assignments WHERE organization_id=p_org AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
  IF v_old.revoked_at IS NOT NULL THEN IF p_payload->>'action'='revoke' THEN RETURN jsonb_build_object('id',p_id); END IF; RETURN jsonb_build_object('code','conflict'); END IF;
  IF v_old.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RETURN jsonb_build_object('code','conflict'); END IF;
  IF p_payload->>'action'='revoke' THEN UPDATE hub_volunteer_assignments SET revoked_at=clock_timestamp(),revoked_by=p_actor,revoke_reason='manual',version=version+1 WHERE id=p_id RETURNING * INTO v_new;
  ELSIF p_payload->>'action'='edit' THEN UPDATE hub_volunteer_assignments SET can_attend=(p_payload->>'canAttend')::boolean,can_collect=coalesce((p_payload->>'canCollect')::boolean,false),version=version+1 WHERE id=p_id RETURNING * INTO v_new;
  ELSE RETURN jsonb_build_object('code','invalid_input'); END IF;
 END IF;
 INSERT INTO hub_volunteer_assignment_changes(organization_id,assignment_id,actor_id,action,before,after) VALUES(p_org,v_new.id,p_actor,coalesce(p_payload->>'action','grant'),CASE WHEN p_id IS NOT NULL THEN to_jsonb(v_old) ELSE NULL END,to_jsonb(v_new));
 INSERT INTO hub_directory_audit(organization_id,actor_id,action,entity_id) VALUES(p_org,p_actor,'volunteer.'||coalesce(p_payload->>'action','grant'),v_new.id::text);
 RETURN jsonb_build_object('id',v_new.id);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('code','access_duplicate');
 WHEN check_violation OR not_null_violation OR invalid_text_representation THEN RETURN jsonb_build_object('code','invalid_input');
END; $$;

CREATE OR REPLACE FUNCTION hub_can_collect_session(p_actor text,p_org uuid,p_activity uuid,p_session uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT hub_is_admin(p_actor,p_org) OR EXISTS(SELECT 1 FROM hub_active_access(p_actor,p_org) v JOIN hub_activity_sessions s ON s.organization_id=p_org AND s.activity_id=p_activity AND s.id=p_session WHERE v.can_collect AND (v.activity_id=p_activity OR (v.group_id IS NOT NULL AND (cardinality(s.audience_group_ids)=0 OR v.group_id=ANY(s.audience_group_ids)))));
$$;
CREATE OR REPLACE FUNCTION hub_can_collect_person(p_actor text,p_org uuid,p_activity uuid,p_session uuid,p_person uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT hub_is_admin(p_actor,p_org) OR EXISTS(SELECT 1 FROM hub_active_access(p_actor,p_org) v JOIN hub_activity_sessions s ON s.organization_id=p_org AND s.activity_id=p_activity AND s.id=p_session WHERE v.can_collect AND (v.activity_id=p_activity OR (v.group_id IS NOT NULL AND (cardinality(s.audience_group_ids)=0 OR v.group_id=ANY(s.audience_group_ids)) AND EXISTS(SELECT 1 FROM himmah.activity_memberships gp WHERE gp.organization_id=p_org AND gp.group_id=v.group_id AND gp.person_id=p_person))));
$$;
-- Internal arithmetic helper. Public reads and commands enforce current actor scope.
CREATE OR REPLACE FUNCTION hub_cash_balance(p_org uuid,p_charge uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('paidMinor',coalesce(sum(a.amount_minor) filter(where rev.id IS NULL),0)::int,'version',(1+count(*)+count(rev.id))::int)
 FROM hub_cash_allocations a LEFT JOIN hub_cash_reversals rev ON rev.organization_id=a.organization_id AND rev.receipt_id=a.receipt_id WHERE a.organization_id=p_org AND a.charge_id=p_charge;
$$;
CREATE OR REPLACE FUNCTION hub_cash_command(p_actor text,p_org uuid,p_activity uuid,p_session uuid,p_key uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE s hub_activity_sessions%ROWTYPE; receipt hub_cash_receipts%ROWTYPE; retry hub_cash_requests%ROWTYPE; item jsonb; charge record; balance jsonb; total bigint:=0; allocated integer; amount integer; action text:=p_payload->>'action'; response jsonb; new_id uuid; parent_cancelled boolean;
BEGIN
 PERFORM 1 FROM himmah.organizations WHERE id=p_org FOR NO KEY UPDATE;
 PERFORM 1 FROM hub_organizations WHERE id=p_org FOR NO KEY UPDATE;
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 SELECT cancelled INTO parent_cancelled FROM hub_activities WHERE organization_id=p_org AND id=p_activity FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 SELECT * INTO s FROM hub_activity_sessions WHERE organization_id=p_org AND activity_id=p_activity AND id=p_session FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 PERFORM hub_lock_access(p_actor,p_org);
 IF NOT hub_can_collect_session(p_actor,p_org,p_activity,p_session) THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 IF p_key IS NULL OR action IS NULL OR action NOT IN ('record','reverse') THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 IF action='reverse' AND NOT hub_is_admin(p_actor,p_org) THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 IF action='record' THEN
  IF jsonb_typeof(p_payload->'allocations') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'allocations') NOT BETWEEN 1 AND 50 THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
  IF (SELECT count(distinct value->>'chargeId') FROM jsonb_array_elements(p_payload->'allocations'))<>jsonb_array_length(p_payload->'allocations') THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
  -- Replays also recheck every contact's current collection scope.
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'allocations') LOOP
   IF NOT EXISTS(SELECT 1 FROM hub_registration_charges ch JOIN hub_session_registrations r ON r.organization_id=ch.organization_id AND r.id=ch.registration_id WHERE ch.organization_id=p_org AND ch.id=(item->>'chargeId')::uuid AND r.activity_id=p_activity AND r.session_id=p_session AND hub_can_collect_person(p_actor,p_org,p_activity,p_session,r.person_id)) THEN RETURN jsonb_build_object('code','forbidden'); END IF;
  END LOOP;
 END IF;
 SELECT * INTO retry FROM hub_cash_requests WHERE organization_id=p_org AND request_key=p_key;
 IF FOUND THEN
  IF retry.actor_id<>p_actor OR retry.session_id<>p_session OR retry.payload<>p_payload THEN RETURN jsonb_build_object('code','cash_key'); END IF;
  RETURN retry.response;
 END IF;
 IF action='record' THEN
  IF s.cancelled OR parent_cancelled OR s.price_minor=0 THEN RETURN jsonb_build_object('code','cash_closed'); END IF;
  amount:=(p_payload->>'amountMinor')::int;
  IF amount IS NULL OR amount NOT BETWEEN 1 AND 100000000 OR length(p_payload->>'payerLabel')>100 OR (p_payload->>'occurredAt')::timestamptz>clock_timestamp()+interval '5 minutes' THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'allocations') ORDER BY value->>'chargeId' LOOP
   SELECT ch.*,r.status INTO charge FROM hub_registration_charges ch JOIN hub_session_registrations r ON r.organization_id=ch.organization_id AND r.id=ch.registration_id WHERE ch.organization_id=p_org AND ch.id=(item->>'chargeId')::uuid FOR UPDATE OF ch;
   balance:=hub_cash_balance(p_org,charge.id); allocated:=(item->>'amountMinor')::int;
   IF charge.status<>'confirmed' THEN RETURN jsonb_build_object('code','cash_closed'); END IF;
   IF (balance->>'version')::int IS DISTINCT FROM (item->>'version')::int THEN RETURN jsonb_build_object('code','conflict'); END IF;
   IF allocated IS NULL OR allocated<1 OR allocated>charge.amount_minor-(balance->>'paidMinor')::int THEN RETURN jsonb_build_object('code','cash_allocation'); END IF;
   total:=total+allocated;
  END LOOP;
  IF total>amount THEN RETURN jsonb_build_object('code','cash_allocation'); END IF;
  INSERT INTO hub_cash_receipts(organization_id,activity_id,session_id,amount_minor,payer_label,occurred_at,created_by) VALUES(p_org,p_activity,p_session,amount,coalesce(p_payload->>'payerLabel',''),(p_payload->>'occurredAt')::timestamptz,p_actor) RETURNING id INTO new_id;
  INSERT INTO hub_cash_allocations(organization_id,receipt_id,charge_id,amount_minor) SELECT p_org,new_id,(value->>'chargeId')::uuid,(value->>'amountMinor')::int FROM jsonb_array_elements(p_payload->'allocations');
 ELSE
  SELECT * INTO receipt FROM hub_cash_receipts WHERE organization_id=p_org AND activity_id=p_activity AND session_id=p_session AND id=(p_payload->>'receiptId')::uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
  IF EXISTS(SELECT 1 FROM hub_cash_reversals WHERE organization_id=p_org AND receipt_id=receipt.id) THEN RETURN jsonb_build_object('code','conflict'); END IF;
  IF length(trim(coalesce(p_payload->>'reason',''))) NOT BETWEEN 1 AND 300 THEN RETURN jsonb_build_object('code','cash_reason'); END IF;
  PERFORM ch.id FROM hub_registration_charges ch JOIN hub_cash_allocations a ON a.organization_id=ch.organization_id AND a.charge_id=ch.id WHERE a.organization_id=p_org AND a.receipt_id=receipt.id ORDER BY ch.id FOR UPDATE OF ch;
  INSERT INTO hub_cash_reversals(organization_id,receipt_id,reason,created_by)VALUES(p_org,receipt.id,trim(p_payload->>'reason'),p_actor) RETURNING id INTO new_id;
 END IF;
 response:=jsonb_build_object('id',new_id);
 INSERT INTO hub_directory_audit(organization_id,actor_id,action,entity_id)VALUES(p_org,p_actor,'cash.'||action,new_id::text);
 INSERT INTO hub_cash_requests(organization_id,activity_id,session_id,request_key,actor_id,payload,response)VALUES(p_org,p_activity,p_session,p_key,p_actor,p_payload,response);
 RETURN response;
EXCEPTION WHEN check_violation OR not_null_violation OR invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN RETURN jsonb_build_object('code','invalid_input');
END; $$;
CREATE TRIGGER hub_cash_receipt_immutable BEFORE UPDATE OR DELETE ON hub_cash_receipts FOR EACH ROW EXECUTE FUNCTION hub_history_immutable();
CREATE TRIGGER hub_cash_allocation_immutable BEFORE UPDATE OR DELETE ON hub_cash_allocations FOR EACH ROW EXECUTE FUNCTION hub_history_immutable();
CREATE TRIGGER hub_cash_reversal_immutable BEFORE UPDATE OR DELETE ON hub_cash_reversals FOR EACH ROW EXECUTE FUNCTION hub_history_immutable();
CREATE TRIGGER hub_cash_request_immutable BEFORE UPDATE OR DELETE ON hub_cash_requests FOR EACH ROW EXECUTE FUNCTION hub_history_immutable();
CREATE OR REPLACE FUNCTION hub_cash_actor_name(p_actor text,p_org uuid) RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE profile text; stored text;
BEGIN
 SELECT nullif(trim(display_name),'') INTO stored FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor;
 IF to_regclass('neon_auth."user"') IS NOT NULL AND p_actor ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
  EXECUTE 'SELECT nullif(trim(name),'''') FROM neon_auth."user" WHERE id=$1' INTO profile USING p_actor::uuid;
 END IF;
 RETURN coalesce(profile,stored);
END; $$;

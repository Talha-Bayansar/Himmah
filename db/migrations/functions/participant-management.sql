-- Unified session commands. Every batch commits attendance, payment corrections and replay together.
CREATE OR REPLACE FUNCTION hub_cash_receipt_corrected(p_org uuid,p_receipt uuid) RETURNS bigint LANGUAGE sql STABLE AS $$
 SELECT coalesce(sum(a.amount_minor),0) FROM hub_cash_allocation_corrections x JOIN hub_cash_allocations a USING(organization_id,receipt_id,charge_id) WHERE x.organization_id=p_org AND x.receipt_id=p_receipt;
$$;
CREATE OR REPLACE FUNCTION hub_cash_balance(p_org uuid,p_charge uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('paidMinor',coalesce(sum(a.amount_minor) filter(where rev.id IS NULL and x.charge_id IS NULL),0)::int,'version',(1+count(*)+count(rev.id)+count(x.charge_id))::int)
 FROM hub_cash_allocations a LEFT JOIN hub_cash_reversals rev ON rev.organization_id=a.organization_id AND rev.receipt_id=a.receipt_id LEFT JOIN hub_cash_allocation_corrections x ON x.organization_id=a.organization_id AND x.receipt_id=a.receipt_id AND x.charge_id=a.charge_id WHERE a.organization_id=p_org AND a.charge_id=p_charge;
$$;
CREATE OR REPLACE FUNCTION hub_manage_participants(p_actor text,p_org uuid,p_activity uuid,p_session uuid,p_key uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE s hub_activity_sessions%ROWTYPE; retry hub_session_operations%ROWTYPE; item jsonb; a hub_attendance%ROWTYPE; bill jsonb; result jsonb; command jsonb; items jsonb:='[]'::jsonb; action text:=p_payload->>'action'; person uuid; subkey uuid; code text; total bigint:=0;
BEGIN
 PERFORM 1 FROM himmah.organizations WHERE id=p_org FOR NO KEY UPDATE;
 PERFORM 1 FROM hub_organizations WHERE id=p_org FOR NO KEY UPDATE;
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 PERFORM 1 FROM hub_activities WHERE organization_id=p_org AND id=p_activity FOR SHARE;
 SELECT * INTO s FROM hub_activity_sessions WHERE organization_id=p_org AND activity_id=p_activity AND id=p_session FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 PERFORM hub_lock_access(p_actor,p_org);
 IF action IS NULL OR action NOT IN ('add','remove','paid','unpaid') OR p_key IS NULL OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 IF jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 50 OR (SELECT count(distinct value->>'personId') FROM jsonb_array_elements(p_payload->'items'))<>jsonb_array_length(p_payload->'items') THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
  person:=(item->>'personId')::uuid;
  IF NOT hub_can_attend_person(p_actor,p_org,p_activity,p_session,person) OR (action IN ('paid','unpaid') AND NOT hub_can_collect_person(p_actor,p_org,p_activity,p_session,person)) THEN RETURN jsonb_build_object('code','forbidden'); END IF;
  IF action='remove' AND ((item ? 'paymentVersion') OR EXISTS(SELECT 1 FROM hub_registration_charges ch WHERE ch.organization_id=p_org AND ch.session_id=p_session AND ch.person_id=person AND (hub_cash_balance(p_org,ch.id)->>'paidMinor')::int>0)) AND NOT hub_can_collect_person(p_actor,p_org,p_activity,p_session,person) THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 END LOOP;
 SELECT * INTO retry FROM hub_session_operations WHERE organization_id=p_org AND request_key=p_key;
 IF FOUND THEN
  IF retry.actor_id<>p_actor OR retry.session_id<>p_session OR retry.payload<>p_payload THEN RETURN jsonb_build_object('code','conflict'); END IF;
  RETURN retry.response;
 END IF;
 IF s.cancelled OR s.starts_at>clock_timestamp() THEN RETURN jsonb_build_object('code',CASE WHEN s.cancelled THEN 'attendance_cancelled' ELSE 'attendance_not_started' END); END IF;
 BEGIN
  -- Validate every target before any effect. The shared session lock serializes all financial/attendance writers.
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') ORDER BY value->>'personId' LOOP
   person:=(item->>'personId')::uuid;
   PERFORM 1 FROM himmah.contacts WHERE organization_id=p_org AND id=person FOR UPDATE;
   SELECT * INTO a FROM hub_attendance WHERE organization_id=p_org AND session_id=p_session AND person_id=person FOR UPDATE;
   IF (item->>'version')::int IS NULL OR (item->>'version')::int<>coalesce(a.version,0) THEN RAISE EXCEPTION USING MESSAGE='conflict'; END IF;
   IF action='add' AND (a.status='present' OR NOT EXISTS(SELECT 1 FROM himmah.activity_contacts c WHERE c.organization_id=p_org AND c.id=person AND NOT c.archived AND (cardinality(s.audience_group_ids)=0 OR EXISTS(SELECT 1 FROM himmah.activity_memberships gp WHERE gp.organization_id=p_org AND gp.person_id=c.id AND gp.group_id=ANY(s.audience_group_ids))))) THEN RAISE EXCEPTION USING MESSAGE='conflict'; END IF;
   IF action IN ('remove','paid','unpaid') AND a.status IS DISTINCT FROM 'present' THEN RAISE EXCEPTION USING MESSAGE='conflict'; END IF;
   bill:=hub_participant_bill(p_actor,p_org,p_activity,p_session,person);
   IF action IN ('paid','unpaid') OR (action='remove' AND bill IS NOT NULL AND (bill->>'paidMinor')::int>0) THEN
    IF bill IS NULL OR (item->>'paymentVersion')::int IS DISTINCT FROM (bill->>'version')::int OR (item->>'sessionVersion')::int IS DISTINCT FROM s.version THEN RAISE EXCEPTION USING MESSAGE='conflict'; END IF;
   END IF;
   IF action='paid' AND ((bill->>'outstandingMinor')::int<1 OR (item->>'amountMinor')::int IS DISTINCT FROM (bill->>'outstandingMinor')::int OR (bill->>'reviewRequired')::boolean OR coalesce((bill->>'registrationRequired')::boolean,false)) THEN RAISE EXCEPTION USING MESSAGE='conflict'; END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') ORDER BY value->>'personId' LOOP
   person:=(item->>'personId')::uuid; subkey:=md5(p_key::text||person::text||action)::uuid;
   bill:=hub_participant_bill(p_actor,p_org,p_activity,p_session,person);
   IF action IN ('remove','unpaid') THEN
    INSERT INTO hub_cash_allocation_corrections(organization_id,receipt_id,charge_id,request_key,reason,created_by)
     SELECT ca.organization_id,ca.receipt_id,ca.charge_id,p_key,action,p_actor FROM hub_cash_allocations ca JOIN hub_registration_charges ch ON ch.organization_id=ca.organization_id AND ch.id=ca.charge_id
     WHERE ch.organization_id=p_org AND ch.session_id=p_session AND ch.person_id=person AND NOT EXISTS(SELECT 1 FROM hub_cash_reversals rev WHERE rev.organization_id=ca.organization_id AND rev.receipt_id=ca.receipt_id)
     ON CONFLICT DO NOTHING;
   ELSIF action='paid' THEN
    command:=jsonb_build_object('action','record','amountMinor',(bill->>'outstandingMinor')::int,'payerLabel','','occurredAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'allocations',jsonb_build_array(CASE WHEN bill->>'status'='not_charged' THEN jsonb_build_object('personId',person,'contactVersion',bill->'contactVersion','sessionVersion',bill->'sessionVersion','version',0,'amountMinor',bill->'outstandingMinor') ELSE jsonb_build_object('chargeId',bill->>'id','version',bill->'version','amountMinor',bill->'outstandingMinor') END));
    result:=hub_billing_command(p_actor,p_org,p_activity,p_session,subkey,command);
    IF result->>'code' IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE=result->>'code'; END IF;
    total:=total+(bill->>'outstandingMinor')::int;
   END IF;
   items:=items||jsonb_build_array(jsonb_build_object('personId',person,'version',item->'version'));
  END LOOP;
  IF action IN ('add','remove') THEN
   result:=hub_save_attendance(p_actor,p_org,p_activity,p_session,p_key,jsonb_build_object('status',CASE WHEN action='add' THEN 'present' ELSE 'unmarked' END,'reason',CASE WHEN action='add' THEN 'Added to attendance list' ELSE 'Removed from attendance list' END,'items',items));
   IF result->>'code' IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE=result->>'code'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(result->'items') x WHERE x->>'outcome' NOT IN ('saved','unchanged')) THEN RAISE EXCEPTION USING MESSAGE='conflict'; END IF;
  ELSE result:=jsonb_build_object('items',(SELECT jsonb_agg(jsonb_build_object('personId',value->>'personId','outcome','saved')) FROM jsonb_array_elements(items))); END IF;
  result:=result||jsonb_build_object('amountMinor',total);
  INSERT INTO hub_directory_audit(organization_id,actor_id,action,entity_id) VALUES(p_org,p_actor,'participants.'||action,p_session::text);
  INSERT INTO hub_session_operations(organization_id,activity_id,session_id,request_key,actor_id,payload,response) VALUES(p_org,p_activity,p_session,p_key,p_actor,p_payload,result);
  RETURN result;
 EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS code=MESSAGE_TEXT; IF code IN ('conflict','forbidden','not_found','cash_closed','cash_allocation','billing_registration_required','registration_ineligible','invalid_input') THEN RETURN jsonb_build_object('code',code); END IF; RAISE;
 END;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR not_null_violation OR check_violation THEN RETURN jsonb_build_object('code','invalid_input');
END; $$;
CREATE TRIGGER hub_cash_correction_immutable BEFORE UPDATE OR DELETE ON hub_cash_allocation_corrections FOR EACH ROW EXECUTE FUNCTION hub_history_immutable();
CREATE TRIGGER hub_participant_operation_immutable BEFORE UPDATE OR DELETE ON hub_session_operations FOR EACH ROW EXECUTE FUNCTION hub_history_immutable();

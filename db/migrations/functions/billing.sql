-- Internal helper; caller holds the organization, membership and session locks.
CREATE OR REPLACE FUNCTION hub_ensure_participant_charge(p_actor text,p_org uuid,p_activity uuid,p_session uuid,p_person uuid,p_contact_version integer,p_session_version integer) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE s hub_activity_sessions%ROWTYPE; c himmah.contacts%ROWTYPE; result uuid;
BEGIN
 IF NOT hub_can_collect_person(p_actor,p_org,p_activity,p_session,p_person) THEN RAISE EXCEPTION USING MESSAGE='forbidden'; END IF;
 SELECT * INTO s FROM hub_activity_sessions WHERE organization_id=p_org AND activity_id=p_activity AND id=p_session;
 IF NOT FOUND THEN RAISE EXCEPTION USING MESSAGE='not_found'; END IF;
 IF s.cancelled OR s.price_minor=0 OR EXISTS(SELECT 1 FROM hub_activities WHERE organization_id=p_org AND id=p_activity AND cancelled) THEN RAISE EXCEPTION USING MESSAGE='cash_closed'; END IF;
 IF s.version IS DISTINCT FROM p_session_version THEN RAISE EXCEPTION USING MESSAGE='conflict'; END IF;
 SELECT * INTO c FROM himmah.contacts WHERE organization_id=p_org AND id=p_person FOR UPDATE;
 IF NOT FOUND OR c.archived_at IS NOT NULL OR (cardinality(s.audience_group_ids)>0 AND NOT EXISTS(SELECT 1 FROM himmah.activity_memberships WHERE organization_id=p_org AND person_id=p_person AND group_id=ANY(s.audience_group_ids))) THEN RAISE EXCEPTION USING MESSAGE='registration_ineligible'; END IF;
 IF c.version IS DISTINCT FROM p_contact_version THEN RAISE EXCEPTION USING MESSAGE='conflict'; END IF;
 IF EXISTS(SELECT 1 FROM hub_session_registration_settings WHERE organization_id=p_org AND session_id=p_session AND mode='required') AND NOT EXISTS(SELECT 1 FROM hub_session_registrations WHERE organization_id=p_org AND session_id=p_session AND person_id=p_person AND status='confirmed') THEN RAISE EXCEPTION USING MESSAGE='billing_registration_required'; END IF;
 IF EXISTS(SELECT 1 FROM hub_registration_charges WHERE organization_id=p_org AND session_id=p_session AND person_id=p_person) THEN RAISE EXCEPTION USING MESSAGE='conflict'; END IF;
 INSERT INTO hub_registration_charges(organization_id,activity_id,session_id,person_id,registration_id,source,amount_minor,created_by)VALUES(p_org,p_activity,p_session,p_person,NULL,'walk_in',s.price_minor,p_actor) RETURNING id INTO result;
 INSERT INTO hub_directory_audit(organization_id,actor_id,action,entity_id)VALUES(p_org,p_actor,'billing.charge',result::text);
 RETURN result;
END; $$;
-- Original intent has its own immutable receipt; the existing cash ledger receives normalized charge IDs.
CREATE OR REPLACE FUNCTION hub_billing_command(p_actor text,p_org uuid,p_activity uuid,p_session uuid,p_key uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE retry hub_billing_requests%ROWTYPE; item jsonb; normalized jsonb:='[]'::jsonb; command jsonb; result jsonb; v_charge_id uuid; person uuid; action text:=p_payload->>'action'; code text;
BEGIN
 PERFORM 1 FROM himmah.organizations WHERE id=p_org FOR NO KEY UPDATE;
 PERFORM 1 FROM hub_organizations WHERE id=p_org FOR NO KEY UPDATE;
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 PERFORM 1 FROM hub_activities WHERE organization_id=p_org AND id=p_activity FOR SHARE;
 PERFORM 1 FROM hub_activity_sessions WHERE organization_id=p_org AND activity_id=p_activity AND id=p_session FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 PERFORM hub_lock_access(p_actor,p_org);
 IF NOT hub_can_collect_session(p_actor,p_org,p_activity,p_session) OR (action='reverse' AND NOT hub_is_admin(p_actor,p_org)) THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 IF action='charge' THEN
  IF NOT hub_can_collect_person(p_actor,p_org,p_activity,p_session,(p_payload->>'personId')::uuid) THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 ELSIF action='record' THEN
  IF jsonb_typeof(p_payload->'allocations') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'allocations') NOT BETWEEN 1 AND 50 THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'allocations') LOOP
   IF item->>'chargeId' IS NOT NULL THEN
    SELECT person_id INTO person FROM hub_registration_charges WHERE organization_id=p_org AND activity_id=p_activity AND session_id=p_session AND id=(item->>'chargeId')::uuid;
   ELSE person:=(item->>'personId')::uuid; END IF;
   IF person IS NULL OR NOT hub_can_collect_person(p_actor,p_org,p_activity,p_session,person) THEN RETURN jsonb_build_object('code','forbidden'); END IF;
  END LOOP;
 ELSIF action IS DISTINCT FROM 'reverse' THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 SELECT * INTO retry FROM hub_billing_requests WHERE organization_id=p_org AND request_key=p_key;
 IF FOUND THEN
  IF retry.actor_id<>p_actor OR retry.session_id<>p_session OR retry.payload<>p_payload THEN RETURN jsonb_build_object('code','cash_key'); END IF;
  RETURN retry.response;
 END IF;
 -- Retain exact replay compatibility for receipts created before this increment.
 IF NOT EXISTS(SELECT 1 FROM hub_billing_requests WHERE organization_id=p_org AND request_key=p_key) AND EXISTS(SELECT 1 FROM hub_cash_requests WHERE organization_id=p_org AND request_key=p_key) THEN RETURN hub_cash_command(p_actor,p_org,p_activity,p_session,p_key,p_payload); END IF;
 BEGIN
  IF action='charge' THEN
   v_charge_id:=hub_ensure_participant_charge(p_actor,p_org,p_activity,p_session,(p_payload->>'personId')::uuid,(p_payload->>'contactVersion')::int,(p_payload->>'sessionVersion')::int);
   result:=jsonb_build_object('id',v_charge_id);
  ELSIF action='record' THEN
   FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'allocations') ORDER BY coalesce(value->>'chargeId',value->>'personId') LOOP
    IF item->>'chargeId' IS NULL THEN
     IF (item->>'version')::int IS DISTINCT FROM 0 THEN RAISE EXCEPTION USING MESSAGE='conflict'; END IF;
     v_charge_id:=hub_ensure_participant_charge(p_actor,p_org,p_activity,p_session,(item->>'personId')::uuid,(item->>'contactVersion')::int,(item->>'sessionVersion')::int);
     normalized:=normalized||jsonb_build_array(jsonb_build_object('chargeId',v_charge_id,'version',1,'amountMinor',item->'amountMinor'));
    ELSE normalized:=normalized||jsonb_build_array(item); END IF;
   END LOOP;
   command:=jsonb_set(p_payload,'{allocations}',normalized);
   result:=hub_cash_command(p_actor,p_org,p_activity,p_session,p_key,command);
   IF result->>'code' IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE=result->>'code'; END IF;
  ELSE
   result:=hub_cash_command(p_actor,p_org,p_activity,p_session,p_key,p_payload);
   IF result->>'code' IS NOT NULL THEN RAISE EXCEPTION USING MESSAGE=result->>'code'; END IF;
  END IF;
  INSERT INTO hub_billing_requests(organization_id,activity_id,session_id,request_key,actor_id,payload,response)VALUES(p_org,p_activity,p_session,p_key,p_actor,p_payload,result);
  RETURN result;
 EXCEPTION WHEN raise_exception THEN GET STACKED DIAGNOSTICS code=MESSAGE_TEXT; IF code IN ('forbidden','not_found','cash_closed','conflict','registration_ineligible','billing_registration_required','cash_allocation','cash_reason','cash_key','invalid_input') THEN RETURN jsonb_build_object('code',code); END IF; RAISE;
 END;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR not_null_violation OR check_violation THEN RETURN jsonb_build_object('code','invalid_input');
END; $$;
CREATE TRIGGER hub_billing_request_immutable BEFORE UPDATE OR DELETE ON hub_billing_requests FOR EACH ROW EXECUTE FUNCTION hub_history_immutable();
-- Read-only financial projection: never create a charge while reading attendance or cash.
CREATE OR REPLACE FUNCTION hub_participant_bill(p_actor text,p_org uuid,p_activity uuid,p_session uuid,p_person uuid) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE s hub_activity_sessions%ROWTYPE; c himmah.contacts%ROWTYPE; ch hub_registration_charges%ROWTYPE; balance jsonb; review boolean; required boolean;
BEGIN
 IF NOT hub_can_collect_person(p_actor,p_org,p_activity,p_session,p_person) THEN RETURN NULL; END IF;
 SELECT * INTO s FROM hub_activity_sessions WHERE organization_id=p_org AND activity_id=p_activity AND id=p_session;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO c FROM himmah.contacts WHERE organization_id=p_org AND id=p_person;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO ch FROM hub_registration_charges WHERE organization_id=p_org AND session_id=p_session AND person_id=p_person;
 IF FOUND THEN
  balance:=hub_cash_balance(p_org,ch.id);
  review:=s.cancelled OR EXISTS(SELECT 1 FROM hub_activities WHERE organization_id=p_org AND id=p_activity AND cancelled) OR (ch.source='registration' AND EXISTS(SELECT 1 FROM hub_session_registrations WHERE organization_id=p_org AND id=ch.registration_id AND status='cancelled'));
  RETURN jsonb_build_object('id',ch.id,'personId',p_person,'contactVersion',c.version,'sessionVersion',s.version,'name',c.display_name,'amountMinor',ch.amount_minor,'paidMinor',(balance->>'paidMinor')::int,'outstandingMinor',ch.amount_minor-(balance->>'paidMinor')::int,'version',(balance->>'version')::int,'status',CASE WHEN (balance->>'paidMinor')::int=0 THEN 'unpaid' WHEN (balance->>'paidMinor')::int=ch.amount_minor THEN 'paid' ELSE 'partial' END,'reviewRequired',review,'canCharge',false,'createdAt',ch.created_at::text);
 END IF;
 IF s.price_minor=0 OR s.cancelled OR EXISTS(SELECT 1 FROM hub_activities WHERE organization_id=p_org AND id=p_activity AND cancelled) OR c.archived_at IS NOT NULL OR (cardinality(s.audience_group_ids)>0 AND NOT EXISTS(SELECT 1 FROM himmah.activity_memberships WHERE organization_id=p_org AND person_id=p_person AND group_id=ANY(s.audience_group_ids))) THEN RETURN NULL; END IF;
 required:=EXISTS(SELECT 1 FROM hub_session_registration_settings WHERE organization_id=p_org AND session_id=p_session AND mode='required') AND NOT EXISTS(SELECT 1 FROM hub_session_registrations WHERE organization_id=p_org AND session_id=p_session AND person_id=p_person AND status='confirmed');
 RETURN jsonb_build_object('id',p_person,'personId',p_person,'contactVersion',c.version,'sessionVersion',s.version,'name',c.display_name,'amountMinor',s.price_minor,'paidMinor',0,'outstandingMinor',s.price_minor,'version',0,'status','not_charged','reviewRequired',false,'canCharge',NOT required,'registrationRequired',required,'createdAt',c.created_at::text);
END; $$;

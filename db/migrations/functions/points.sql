-- Invoker transaction: receipt deduplication, append-only awards/adjustments and serialized member balances.
CREATE OR REPLACE FUNCTION hub_save_points(p_actor text,p_org uuid,p_key uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
 v_receipt hub_points_requests%ROWTYPE;
 v_person hub_people%ROWTYPE;
 v_original hub_points_entries%ROWTYPE;
 v_request uuid;
 v_id uuid;
 v_results jsonb := '[]'::jsonb;
 v_kind text := p_payload->>'kind';
 v_amount integer := (p_payload->>'amount')::integer;
 v_reason text := p_payload->>'reason';
 v_current integer;
 v_version integer;
 v_delta integer;
 v_date timestamptz;
 v_activity uuid := (p_payload->>'activityId')::uuid;
 v_session uuid := (p_payload->>'sessionId')::uuid;
BEGIN
 -- Organization lock serializes receipts across different staff accounts, including same-key retries.
 PERFORM 1 FROM hub_organizations WHERE id=p_org FOR NO KEY UPDATE;
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin') FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 IF v_kind IS NULL OR v_kind NOT IN ('award','correct') OR v_amount IS NULL OR v_amount NOT BETWEEN 0 AND 10000 OR (v_kind='award' AND v_amount=0) OR v_reason IS NULL OR length(trim(v_reason)) NOT BETWEEN 1 AND 300 OR jsonb_typeof(p_payload->'people') IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 IF jsonb_array_length(p_payload->'people') NOT BETWEEN 1 AND 50 OR (SELECT count(DISTINCT value::text::uuid) FROM jsonb_array_elements_text(p_payload->'people'))<>jsonb_array_length(p_payload->'people') THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 SELECT * INTO v_receipt FROM hub_points_requests WHERE organization_id=p_org AND request_key=p_key;
 IF FOUND THEN
  IF v_receipt.actor_id<>p_actor OR v_receipt.payload<>p_payload THEN RETURN jsonb_build_object('code','points_key_conflict'); END IF;
  RETURN v_receipt.response;
 END IF;
 IF v_kind='award' THEN
  v_date := (p_payload->>'occurredAt')::timestamptz;
  IF v_date IS NULL OR v_date>clock_timestamp() OR v_date<'2000-01-01T00:00Z'::timestamptz THEN RETURN jsonb_build_object('code','points_date'); END IF;
  IF (v_session IS NOT NULL AND v_activity IS NULL) OR (v_activity IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hub_activities WHERE organization_id=p_org AND id=v_activity)) OR (v_session IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hub_activity_sessions WHERE organization_id=p_org AND activity_id=v_activity AND id=v_session)) THEN RETURN jsonb_build_object('code','not_found'); END IF;
 ELSIF jsonb_array_length(p_payload->'people')<>1 OR (p_payload->>'version') IS NULL OR (p_payload->>'version')::integer<1 OR v_activity IS NOT NULL OR v_session IS NOT NULL THEN RETURN jsonb_build_object('code','invalid_input');
 END IF;
 INSERT INTO hub_points_requests(organization_id,request_key,actor_id,payload,response) VALUES(p_org,p_key,p_actor,p_payload,'{}') RETURNING id INTO v_request;
 FOR v_id IN SELECT value::uuid FROM jsonb_array_elements_text(p_payload->'people') ORDER BY value LOOP
  SELECT * INTO v_person FROM hub_people WHERE organization_id=p_org AND id=v_id FOR UPDATE;
  IF NOT FOUND THEN v_results := v_results || jsonb_build_array(jsonb_build_object('personId',v_id,'name','','outcome','ineligible')); CONTINUE; END IF;
  IF v_kind='award' AND v_person.archived THEN v_results := v_results || jsonb_build_array(jsonb_build_object('personId',v_id,'name',v_person.name,'outcome','ineligible')); CONTINUE; END IF;
  IF v_kind='correct' THEN
   SELECT * INTO v_original FROM hub_points_entries WHERE organization_id=p_org AND person_id=v_id AND id=(p_payload->>'originalId')::uuid AND original_id IS NULL;
   IF NOT FOUND THEN v_results := v_results || jsonb_build_array(jsonb_build_object('personId',v_id,'name',v_person.name,'outcome','ineligible')); CONTINUE; END IF;
   IF v_original.source='attendance' THEN v_results := v_results || jsonb_build_array(jsonb_build_object('personId',v_id,'name',v_person.name,'outcome','managed')); CONTINUE; END IF;
   SELECT (v_original.amount+coalesce(sum(amount),0))::integer,(count(*)+1)::integer INTO v_current,v_version FROM hub_points_entries WHERE organization_id=p_org AND person_id=v_id AND original_id=v_original.id;
   IF v_version<>(p_payload->>'version')::integer THEN v_results := v_results || jsonb_build_array(jsonb_build_object('personId',v_id,'name',v_person.name,'outcome','conflict')); CONTINUE; END IF;
   v_delta := v_amount-v_current;
   IF v_delta=0 THEN v_results := v_results || jsonb_build_array(jsonb_build_object('personId',v_id,'name',v_person.name,'outcome','unchanged')); CONTINUE; END IF;
   v_date := v_original.occurred_at;
  ELSE v_delta := v_amount;
  END IF;
  INSERT INTO hub_points_entries(organization_id,person_id,request_id,actor_id,amount,reason,original_id,activity_id,session_id,occurred_at)
  VALUES(p_org,v_id,v_request,p_actor,v_delta,v_reason,CASE WHEN v_kind='correct' THEN v_original.id ELSE NULL END,CASE WHEN v_kind='correct' THEN v_original.activity_id ELSE v_activity END,CASE WHEN v_kind='correct' THEN v_original.session_id ELSE v_session END,v_date);
  v_results := v_results || jsonb_build_array(jsonb_build_object('personId',v_id,'name',v_person.name,'outcome','saved'));
 END LOOP;
 UPDATE hub_points_requests SET response=jsonb_build_object('items',v_results) WHERE id=v_request;
 RETURN jsonb_build_object('items',v_results);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN
 RETURN jsonb_build_object('code','invalid_input');
END;
$$;
-- Protect ledger history from accidental edits through application SQL.
--> statement-breakpoint
CREATE FUNCTION hub_points_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Points entries are append-only'; END; $$;
--> statement-breakpoint
CREATE TRIGGER hub_points_immutable BEFORE UPDATE OR DELETE ON hub_points_entries FOR EACH ROW EXECUTE FUNCTION hub_points_immutable();

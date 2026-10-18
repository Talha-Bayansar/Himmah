-- Invoker function: one transaction, session lock, immutable request receipts and per-member outcomes.
CREATE OR REPLACE FUNCTION hub_save_attendance(p_actor text,p_org uuid,p_activity uuid,p_session uuid,p_key uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
 v_session hub_activity_sessions%ROWTYPE;
 v_receipt hub_attendance_requests%ROWTYPE;
 v_person hub_people%ROWTYPE;
 v_mark hub_attendance%ROWTYPE;
 v_item jsonb;
 v_results jsonb := '[]'::jsonb;
 v_status text := p_payload->>'status';
 v_reason text := p_payload->>'reason';
 v_person_id uuid;
 v_expected integer;
 v_version integer;
 v_before text;
 v_eligible boolean;
 v_request_id uuid;
 v_saved integer := 0;
BEGIN
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin') FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 SELECT * INTO v_session FROM hub_activity_sessions WHERE organization_id=p_org AND activity_id=p_activity AND id=p_session FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR v_status IS NULL OR v_status NOT IN ('unmarked','present','absent','excused') OR v_reason IS NULL OR length(v_reason)>300 THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 IF jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 50 OR (SELECT count(DISTINCT value->>'personId') FROM jsonb_array_elements(p_payload->'items')) <> jsonb_array_length(p_payload->'items') THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 SELECT * INTO v_receipt FROM hub_attendance_requests WHERE organization_id=p_org AND session_id=p_session AND request_key=p_key;
 IF FOUND THEN
  IF v_receipt.actor_id <> p_actor OR v_receipt.payload <> p_payload THEN RETURN jsonb_build_object('code','attendance_key_conflict'); END IF;
  RETURN v_receipt.response;
 END IF;
 IF v_session.cancelled THEN RETURN jsonb_build_object('code','attendance_cancelled'); END IF;
 IF v_session.starts_at > clock_timestamp() THEN RETURN jsonb_build_object('code','attendance_not_started'); END IF;
 INSERT INTO hub_attendance_requests(organization_id,activity_id,session_id,request_key,actor_id,payload,response)
 VALUES(p_org,p_activity,p_session,p_key,p_actor,p_payload,'{}'::jsonb) RETURNING id INTO v_request_id;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'items') ORDER BY value->>'personId' LOOP
  v_person_id := (v_item->>'personId')::uuid;
  v_expected := (v_item->>'version')::integer;
  IF v_expected IS NULL OR v_expected<0 OR v_expected>=2147483647 THEN RAISE invalid_parameter_value; END IF;
  SELECT * INTO v_person FROM hub_people WHERE organization_id=p_org AND id=v_person_id FOR UPDATE;
  IF NOT FOUND THEN v_results := v_results || jsonb_build_array(jsonb_build_object('personId',v_person_id,'outcome','ineligible')); CONTINUE; END IF;
  SELECT * INTO v_mark FROM hub_attendance WHERE organization_id=p_org AND session_id=p_session AND person_id=v_person_id FOR UPDATE;
  v_version := coalesce(v_mark.version,0);
  v_before := coalesce(v_mark.status,'unmarked');
  v_eligible := NOT v_person.archived;
  IF v_eligible AND cardinality(v_session.audience_group_ids)>0 THEN
   PERFORM 1 FROM hub_group_people gp WHERE gp.organization_id=p_org AND gp.person_id=v_person_id AND gp.group_id=ANY(v_session.audience_group_ids) LIMIT 1 FOR KEY SHARE;
   v_eligible := FOUND;
  END IF;
  IF v_version=0 AND NOT v_eligible THEN v_results := v_results || jsonb_build_array(jsonb_build_object('personId',v_person_id,'outcome','ineligible')); CONTINUE; END IF;
  IF v_expected <> v_version THEN v_results := v_results || jsonb_build_array(jsonb_build_object('personId',v_person_id,'outcome','conflict')); CONTINUE; END IF;
  IF v_before=v_status THEN v_results := v_results || jsonb_build_array(jsonb_build_object('personId',v_person_id,'outcome','unchanged','status',v_before,'version',v_version)); CONTINUE; END IF;
  IF v_version>0 AND length(trim(v_reason))=0 THEN v_results := v_results || jsonb_build_array(jsonb_build_object('personId',v_person_id,'outcome','reason_required')); CONTINUE; END IF;
  INSERT INTO hub_attendance(organization_id,activity_id,session_id,person_id,status,version)
  VALUES(p_org,p_activity,p_session,v_person_id,v_status,v_version+1)
  ON CONFLICT(organization_id,session_id,person_id) DO UPDATE SET status=EXCLUDED.status,version=EXCLUDED.version,updated_at=clock_timestamp();
  INSERT INTO hub_attendance_changes(organization_id,session_id,person_id,request_id,actor_id,before_status,after_status,reason,version)
  VALUES(p_org,p_session,v_person_id,v_request_id,p_actor,v_before,v_status,v_reason,v_version+1);
  v_saved := v_saved+1;
  v_results := v_results || jsonb_build_array(jsonb_build_object('personId',v_person_id,'outcome','saved','status',v_status,'version',v_version+1));
 END LOOP;
 UPDATE hub_attendance_requests SET response=jsonb_build_object('items',v_results) WHERE id=v_request_id;
 IF v_saved>0 THEN INSERT INTO hub_directory_audit(organization_id,actor_id,action,entity_id) VALUES(p_org,p_actor,'attendance.save',p_session::text); END IF;
 RETURN jsonb_build_object('items',v_results);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_parameter_value THEN
 RETURN jsonb_build_object('code','invalid_input');
END;
$$;

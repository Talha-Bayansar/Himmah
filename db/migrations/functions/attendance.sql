-- Invoker function: one transaction, session lock, immutable request receipts and per-member outcomes.
CREATE OR REPLACE FUNCTION hub_attendance_operation(p_actor text,p_org uuid,p_activity uuid,p_session uuid,p_key uuid,p_payload jsonb,p_preview boolean)
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
 v_root uuid;
 v_current integer;
 v_delta integer;
 v_points_request uuid;
 v_entry uuid;
 v_points_reason text;
BEGIN
 PERFORM 1 FROM hub_organizations WHERE id=p_org FOR NO KEY UPDATE;
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin') FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 SELECT * INTO v_session FROM hub_activity_sessions WHERE organization_id=p_org AND activity_id=p_activity AND id=p_session FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR v_status IS NULL OR v_status NOT IN ('unmarked','present','absent','excused') OR v_reason IS NULL OR length(v_reason)>300 THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 IF jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 50 OR (SELECT count(DISTINCT value->>'personId') FROM jsonb_array_elements(p_payload->'items')) <> jsonb_array_length(p_payload->'items') THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 SELECT * INTO v_receipt FROM hub_attendance_requests WHERE organization_id=p_org AND session_id=p_session AND request_key=p_key;
 IF FOUND AND NOT p_preview THEN
  IF v_receipt.actor_id <> p_actor OR v_receipt.payload <> p_payload THEN RETURN jsonb_build_object('code','attendance_key_conflict'); END IF;
  RETURN v_receipt.response;
 END IF;
 IF v_session.cancelled THEN RETURN jsonb_build_object('code','attendance_cancelled'); END IF;
 IF v_session.starts_at > clock_timestamp() THEN RETURN jsonb_build_object('code','attendance_not_started'); END IF;
 IF v_session.attendance_points>0 AND NOT p_preview AND (p_payload->>'confirmPoints') IS DISTINCT FROM 'true' THEN RETURN jsonb_build_object('code','earning_review_required'); END IF;
 IF NOT p_preview THEN
 INSERT INTO hub_attendance_requests(organization_id,activity_id,session_id,request_key,actor_id,payload,response)
 VALUES(p_org,p_activity,p_session,p_key,p_actor,p_payload,'{}'::jsonb) RETURNING id INTO v_request_id;
 END IF;
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
  v_root := NULL; v_current := 0; v_delta := 0;
  IF v_session.attendance_points>0 THEN
   SELECT original_id INTO v_root FROM hub_attendance_awards WHERE organization_id=p_org AND session_id=p_session AND person_id=v_person_id;
   IF v_root IS NOT NULL THEN
    SELECT coalesce(sum(amount),0)::integer INTO v_current FROM hub_points_entries WHERE organization_id=p_org AND person_id=v_person_id AND (id=v_root OR original_id=v_root);
   END IF;
   v_delta := (CASE WHEN v_status='present' THEN v_session.attendance_points ELSE 0 END)-v_current;
  END IF;
  IF NOT p_preview THEN
  INSERT INTO hub_attendance(organization_id,activity_id,session_id,person_id,status,version)
  VALUES(p_org,p_activity,p_session,v_person_id,v_status,v_version+1)
  ON CONFLICT(organization_id,session_id,person_id) DO UPDATE SET status=EXCLUDED.status,version=EXCLUDED.version,updated_at=clock_timestamp();
  INSERT INTO hub_attendance_changes(organization_id,session_id,person_id,request_id,actor_id,before_status,after_status,reason,version)
  VALUES(p_org,p_session,v_person_id,v_request_id,p_actor,v_before,v_status,v_reason,v_version+1);
  IF v_delta<>0 THEN
   IF v_points_request IS NULL THEN
    INSERT INTO hub_points_requests(organization_id,request_key,actor_id,payload,response)
    VALUES(p_org,gen_random_uuid(),p_actor,jsonb_build_object('source','attendance','attendanceRequestId',v_request_id,'sessionId',p_session,'ruleVersion',v_session.earning_rule_version),'{}') RETURNING id INTO v_points_request;
   END IF;
   v_points_reason := CASE WHEN length(trim(v_reason))>0 THEN v_reason ELSE v_session.name END;
   INSERT INTO hub_points_entries(organization_id,person_id,request_id,actor_id,amount,reason,original_id,activity_id,session_id,occurred_at,source,rule_version)
   VALUES(p_org,v_person_id,v_points_request,p_actor,v_delta,v_points_reason,v_root,p_activity,p_session,v_session.starts_at,'attendance',v_session.earning_rule_version) RETURNING id INTO v_entry;
   IF v_root IS NULL THEN INSERT INTO hub_attendance_awards(organization_id,activity_id,session_id,person_id,original_id) VALUES(p_org,p_activity,p_session,v_person_id,v_entry); END IF;
  END IF;
  END IF;
  v_saved := v_saved+1;
  v_results := v_results || jsonb_build_array(jsonb_build_object('personId',v_person_id,'outcome','saved','status',v_status,'version',v_version+1,'pointsDelta',v_delta));
 END LOOP;
 IF NOT p_preview THEN
 UPDATE hub_attendance_requests SET response=jsonb_build_object('items',v_results) WHERE id=v_request_id;
 IF v_saved>0 THEN INSERT INTO hub_directory_audit(organization_id,actor_id,action,entity_id) VALUES(p_org,p_actor,'attendance.save',p_session::text); END IF;
 IF v_points_request IS NOT NULL THEN UPDATE hub_points_requests SET response=jsonb_build_object('items',v_results) WHERE id=v_points_request; END IF;
 END IF;
 RETURN jsonb_build_object('items',v_results);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_parameter_value THEN
 RETURN jsonb_build_object('code','invalid_input');
END;
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION hub_save_attendance(p_actor text,p_org uuid,p_activity uuid,p_session uuid,p_key uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE sql AS $$ SELECT hub_attendance_operation(p_actor,p_org,p_activity,p_session,p_key,p_payload,false); $$;
--> statement-breakpoint
CREATE FUNCTION hub_preview_attendance(p_actor text,p_org uuid,p_activity uuid,p_session uuid,p_key uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE sql AS $$ SELECT hub_attendance_operation(p_actor,p_org,p_activity,p_session,p_key,p_payload,true); $$;
--> statement-breakpoint
CREATE FUNCTION hub_session_rule_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.attendance_points IS DISTINCT FROM OLD.attendance_points OR NEW.earning_rule_version IS DISTINCT FROM OLD.earning_rule_version THEN RAISE EXCEPTION 'Saved session earning rules are immutable'; END IF; RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER hub_session_rule_guard BEFORE UPDATE ON hub_activity_sessions FOR EACH ROW EXECUTE FUNCTION hub_session_rule_guard();

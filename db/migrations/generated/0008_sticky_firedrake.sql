CREATE TABLE "hub_volunteer_assignment_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub_volunteer_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"staff_name" text NOT NULL,
	"group_id" uuid,
	"activity_id" uuid,
	"scope_name" text NOT NULL,
	"can_attend" boolean NOT NULL,
	"can_award" boolean NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"creation_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"revoke_reason" text,
	CONSTRAINT "hub_volunteer_assignment_scope" UNIQUE("organization_id","id"),
	CONSTRAINT "hub_volunteer_assignment_creation" UNIQUE("organization_id","creation_key"),
	CONSTRAINT "hub_volunteer_assignment_target" CHECK (("hub_volunteer_assignments"."group_id" is null) <> ("hub_volunteer_assignments"."activity_id" is null)),
	CONSTRAINT "hub_volunteer_assignment_capabilities" CHECK ("hub_volunteer_assignments"."can_attend" or "hub_volunteer_assignments"."can_award"),
	CONSTRAINT "hub_volunteer_assignment_version" CHECK ("hub_volunteer_assignments"."version">0)
);
--> statement-breakpoint
ALTER TABLE "hub_volunteer_assignment_changes" ADD CONSTRAINT "hub_volunteer_assignment_changes_organization_id_assignment_id_hub_volunteer_assignments_organization_id_id_fk" FOREIGN KEY ("organization_id","assignment_id") REFERENCES "public"."hub_volunteer_assignments"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_volunteer_assignments" ADD CONSTRAINT "hub_volunteer_assignments_organization_id_hub_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."hub_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_volunteer_assignments" ADD CONSTRAINT "hub_volunteer_assignments_organization_id_group_id_hub_groups_organization_id_id_fk" FOREIGN KEY ("organization_id","group_id") REFERENCES "public"."hub_groups"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_volunteer_assignments" ADD CONSTRAINT "hub_volunteer_assignments_organization_id_activity_id_hub_activities_organization_id_id_fk" FOREIGN KEY ("organization_id","activity_id") REFERENCES "public"."hub_activities"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hub_volunteer_assignment_history" ON "hub_volunteer_assignment_changes" USING btree ("organization_id","assignment_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_volunteer_active_group" ON "hub_volunteer_assignments" USING btree ("organization_id","user_id","group_id") WHERE "hub_volunteer_assignments"."revoked_at" is null and "hub_volunteer_assignments"."group_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "hub_volunteer_active_activity" ON "hub_volunteer_assignments" USING btree ("organization_id","user_id","activity_id") WHERE "hub_volunteer_assignments"."revoked_at" is null and "hub_volunteer_assignments"."activity_id" is not null;--> statement-breakpoint
CREATE INDEX "hub_volunteer_assignment_page" ON "hub_volunteer_assignments" USING btree ("organization_id","created_at","id");
--> statement-breakpoint
CREATE FUNCTION hub_is_admin(p_actor text,p_org uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin'));
$$;
--> statement-breakpoint
CREATE FUNCTION hub_active_access(p_actor text,p_org uuid) RETURNS SETOF hub_volunteer_assignments LANGUAGE sql STABLE AS $$
 SELECT v.* FROM hub_volunteer_assignments v JOIN hub_memberships m ON m.organization_id=v.organization_id AND m.user_id=v.user_id AND m.role='volunteer'
 WHERE v.organization_id=p_org AND v.user_id=p_actor AND v.revoked_at IS NULL
 AND (EXISTS(SELECT 1 FROM hub_groups g WHERE g.organization_id=p_org AND g.id=v.group_id AND NOT g.archived) OR EXISTS(SELECT 1 FROM hub_activities a WHERE a.organization_id=p_org AND a.id=v.activity_id AND NOT a.cancelled));
$$;
--> statement-breakpoint
CREATE FUNCTION hub_can_award(p_actor text,p_org uuid,p_person uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT hub_is_admin(p_actor,p_org) OR EXISTS(SELECT 1 FROM hub_active_access(p_actor,p_org) v WHERE v.can_award AND
 (EXISTS(SELECT 1 FROM hub_group_people gp WHERE gp.organization_id=p_org AND gp.person_id=p_person AND gp.group_id=v.group_id) OR EXISTS(SELECT 1 FROM hub_activities a WHERE a.organization_id=p_org AND a.id=v.activity_id AND (cardinality(a.audience_group_ids)=0 OR EXISTS(SELECT 1 FROM hub_group_people gp WHERE gp.organization_id=p_org AND gp.person_id=p_person AND gp.group_id=ANY(a.audience_group_ids))))));
$$;
--> statement-breakpoint
CREATE FUNCTION hub_can_view_session(p_actor text,p_org uuid,p_activity uuid,p_session uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT hub_is_admin(p_actor,p_org) OR EXISTS(SELECT 1 FROM hub_active_access(p_actor,p_org) v JOIN hub_activity_sessions s ON s.organization_id=p_org AND s.activity_id=p_activity AND s.id=p_session WHERE v.activity_id=p_activity OR (v.group_id IS NOT NULL AND (cardinality(s.audience_group_ids)=0 OR v.group_id=ANY(s.audience_group_ids))));
$$;
--> statement-breakpoint
CREATE FUNCTION hub_can_view_activity(p_actor text,p_org uuid,p_activity uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT hub_is_admin(p_actor,p_org) OR EXISTS(SELECT 1 FROM hub_active_access(p_actor,p_org) v JOIN hub_activities a ON a.organization_id=p_org AND a.id=p_activity WHERE v.activity_id=p_activity OR (v.group_id IS NOT NULL AND (cardinality(a.audience_group_ids)=0 OR v.group_id=ANY(a.audience_group_ids) OR EXISTS(SELECT 1 FROM hub_activity_sessions s WHERE s.organization_id=p_org AND s.activity_id=p_activity AND (cardinality(s.audience_group_ids)=0 OR v.group_id=ANY(s.audience_group_ids))))));
$$;
--> statement-breakpoint
CREATE FUNCTION hub_can_attend_session(p_actor text,p_org uuid,p_activity uuid,p_session uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT hub_is_admin(p_actor,p_org) OR EXISTS(SELECT 1 FROM hub_active_access(p_actor,p_org) v JOIN hub_activity_sessions s ON s.organization_id=p_org AND s.activity_id=p_activity AND s.id=p_session WHERE v.can_attend AND (v.activity_id=p_activity OR (v.group_id IS NOT NULL AND (cardinality(s.audience_group_ids)=0 OR v.group_id=ANY(s.audience_group_ids)))));
$$;
--> statement-breakpoint
CREATE FUNCTION hub_can_attend_person(p_actor text,p_org uuid,p_activity uuid,p_session uuid,p_person uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT hub_is_admin(p_actor,p_org) OR EXISTS(SELECT 1 FROM hub_active_access(p_actor,p_org) v JOIN hub_activity_sessions s ON s.organization_id=p_org AND s.activity_id=p_activity AND s.id=p_session WHERE v.can_attend AND (v.activity_id=p_activity OR (v.group_id IS NOT NULL AND (cardinality(s.audience_group_ids)=0 OR v.group_id=ANY(s.audience_group_ids)) AND EXISTS(SELECT 1 FROM hub_group_people gp WHERE gp.organization_id=p_org AND gp.group_id=v.group_id AND gp.person_id=p_person))));
$$;
--> statement-breakpoint
CREATE FUNCTION hub_can_view_group(p_actor text,p_org uuid,p_group uuid,p_activity uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT hub_is_admin(p_actor,p_org) OR EXISTS(SELECT 1 FROM hub_active_access(p_actor,p_org) WHERE group_id=p_group OR activity_id=p_activity);
$$;
--> statement-breakpoint
CREATE FUNCTION hub_can_view_points(p_actor text,p_org uuid,p_entry uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT hub_is_admin(p_actor,p_org) OR EXISTS(SELECT 1 FROM hub_points_entries e LEFT JOIN hub_points_entries original ON original.organization_id=e.organization_id AND original.person_id=e.person_id AND original.id=e.original_id WHERE e.organization_id=p_org AND e.id=p_entry AND ((e.source='manual' AND coalesce(original.actor_id,e.actor_id)=p_actor AND hub_can_award(p_actor,p_org,e.person_id)) OR (e.source='attendance' AND hub_can_attend_person(p_actor,p_org,e.activity_id,e.session_id,e.person_id))));
$$;
--> statement-breakpoint
CREATE FUNCTION hub_can_view_member(p_actor text,p_org uuid,p_person uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT hub_can_award(p_actor,p_org,p_person) OR EXISTS(SELECT 1 FROM hub_points_entries WHERE organization_id=p_org AND person_id=p_person AND hub_can_view_points(p_actor,p_org,id));
$$;
--> statement-breakpoint
CREATE FUNCTION hub_lock_access(p_actor text,p_org uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM hub_groups WHERE organization_id=p_org AND id IN (SELECT group_id FROM hub_volunteer_assignments WHERE organization_id=p_org AND user_id=p_actor AND revoked_at IS NULL) ORDER BY id FOR SHARE;
 PERFORM 1 FROM hub_activities WHERE organization_id=p_org AND id IN (SELECT activity_id FROM hub_volunteer_assignments WHERE organization_id=p_org AND user_id=p_actor AND revoked_at IS NULL) ORDER BY id FOR SHARE;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION hub_save_access(p_actor text,p_org uuid,p_id uuid,p_key uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_old hub_volunteer_assignments%ROWTYPE;v_new hub_volunteer_assignments%ROWTYPE;v_role text;v_name text;v_scope text;v_group uuid;v_activity uuid;
BEGIN
 PERFORM 1 FROM hub_organizations WHERE id=p_org FOR NO KEY UPDATE;
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin') FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 IF p_id IS NULL THEN
  SELECT * INTO v_old FROM hub_volunteer_assignments WHERE organization_id=p_org AND creation_key=p_key;
  IF FOUND THEN IF v_old.created_by<>p_actor THEN RETURN jsonb_build_object('code','conflict'); END IF; RETURN jsonb_build_object('id',v_old.id); END IF;
  SELECT role,coalesce(display_name,'') INTO v_role,v_name FROM hub_memberships WHERE organization_id=p_org AND user_id=p_payload->>'userId' FOR UPDATE;
  IF v_role IS DISTINCT FROM 'volunteer' THEN RETURN jsonb_build_object('code','access_volunteer'); END IF;
  v_group := (p_payload->>'groupId')::uuid; v_activity := (p_payload->>'activityId')::uuid;
  IF (v_group IS NULL)=(v_activity IS NULL) THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
  IF v_group IS NOT NULL THEN SELECT name INTO v_scope FROM hub_groups WHERE organization_id=p_org AND id=v_group AND NOT archived FOR SHARE;
  ELSE SELECT name INTO v_scope FROM hub_activities WHERE organization_id=p_org AND id=v_activity AND NOT cancelled FOR SHARE; END IF;
  IF v_scope IS NULL THEN RETURN jsonb_build_object('code','not_found'); END IF;
  INSERT INTO hub_volunteer_assignments(organization_id,user_id,staff_name,group_id,activity_id,scope_name,can_attend,can_award,created_by,creation_key)
  VALUES(p_org,p_payload->>'userId',v_name,v_group,v_activity,v_scope,(p_payload->>'canAttend')::boolean,(p_payload->>'canAward')::boolean,p_actor,p_key) RETURNING * INTO v_new;
 ELSE
  SELECT * INTO v_old FROM hub_volunteer_assignments WHERE organization_id=p_org AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
  IF v_old.revoked_at IS NOT NULL THEN IF p_payload->>'action'='revoke' THEN RETURN jsonb_build_object('id',p_id); END IF; RETURN jsonb_build_object('code','conflict'); END IF;
  IF v_old.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RETURN jsonb_build_object('code','conflict'); END IF;
  IF p_payload->>'action'='revoke' THEN UPDATE hub_volunteer_assignments SET revoked_at=clock_timestamp(),revoked_by=p_actor,revoke_reason='manual',version=version+1 WHERE id=p_id RETURNING * INTO v_new;
  ELSIF p_payload->>'action'='edit' THEN UPDATE hub_volunteer_assignments SET can_attend=(p_payload->>'canAttend')::boolean,can_award=(p_payload->>'canAward')::boolean,version=version+1 WHERE id=p_id RETURNING * INTO v_new;
  ELSE RETURN jsonb_build_object('code','invalid_input'); END IF;
 END IF;
 INSERT INTO hub_volunteer_assignment_changes(organization_id,assignment_id,actor_id,action,before,after) VALUES(p_org,v_new.id,p_actor,coalesce(p_payload->>'action','grant'),CASE WHEN p_id IS NOT NULL THEN to_jsonb(v_old) ELSE NULL END,to_jsonb(v_new));
 INSERT INTO hub_directory_audit(organization_id,actor_id,action,entity_id) VALUES(p_org,p_actor,'volunteer.'||coalesce(p_payload->>'action','grant'),v_new.id::text);
 RETURN jsonb_build_object('id',v_new.id);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('code','access_duplicate');
 WHEN check_violation OR not_null_violation OR invalid_text_representation THEN RETURN jsonb_build_object('code','invalid_input');
END; $$;
--> statement-breakpoint
CREATE FUNCTION hub_revoke_role_access() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_old hub_volunteer_assignments%ROWTYPE;v_new hub_volunteer_assignments%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' AND NEW.role=OLD.role THEN RETURN NEW; END IF;
 FOR v_old IN SELECT * FROM hub_volunteer_assignments WHERE organization_id=OLD.organization_id AND user_id=OLD.user_id AND revoked_at IS NULL FOR UPDATE LOOP
  UPDATE hub_volunteer_assignments SET revoked_at=clock_timestamp(),revoke_reason='staff_change',version=version+1 WHERE id=v_old.id RETURNING * INTO v_new;
  INSERT INTO hub_volunteer_assignment_changes(organization_id,assignment_id,actor_id,action,before,after) VALUES(OLD.organization_id,v_old.id,NULL,'staff_change',to_jsonb(v_old),to_jsonb(v_new));
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER hub_revoke_role_access BEFORE UPDATE OF role OR DELETE ON hub_memberships FOR EACH ROW EXECUTE FUNCTION hub_revoke_role_access();
--> statement-breakpoint
CREATE TRIGGER hub_access_history_immutable BEFORE UPDATE OR DELETE ON hub_volunteer_assignment_changes FOR EACH ROW EXECUTE FUNCTION hub_points_immutable();

--> statement-breakpoint
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
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin','volunteer') FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 SELECT * INTO v_session FROM hub_activity_sessions WHERE organization_id=p_org AND activity_id=p_activity AND id=p_session FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR v_status IS NULL OR v_status NOT IN ('unmarked','present','absent','excused') OR v_reason IS NULL OR length(v_reason)>300 THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 IF jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 50 OR (SELECT count(DISTINCT value->>'personId') FROM jsonb_array_elements(p_payload->'items')) <> jsonb_array_length(p_payload->'items') THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 PERFORM 1 FROM hub_people WHERE organization_id=p_org AND id IN (SELECT (value->>'personId')::uuid FROM jsonb_array_elements(p_payload->'items')) ORDER BY id FOR UPDATE;
 PERFORM hub_lock_access(p_actor,p_org);
 IF NOT hub_can_attend_session(p_actor,p_org,p_activity,p_session) OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'items') item WHERE NOT hub_can_attend_person(p_actor,p_org,p_activity,p_session,(item->>'personId')::uuid)) THEN RETURN jsonb_build_object('code','forbidden'); END IF;
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
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin','volunteer') FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 IF v_kind IS NULL OR v_kind NOT IN ('award','correct') OR v_amount IS NULL OR v_amount NOT BETWEEN 0 AND 10000 OR (v_kind='award' AND v_amount=0) OR v_reason IS NULL OR length(trim(v_reason)) NOT BETWEEN 1 AND 300 OR jsonb_typeof(p_payload->'people') IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 IF jsonb_array_length(p_payload->'people') NOT BETWEEN 1 AND 50 OR (SELECT count(DISTINCT value::text::uuid) FROM jsonb_array_elements_text(p_payload->'people'))<>jsonb_array_length(p_payload->'people') THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 PERFORM 1 FROM hub_people WHERE organization_id=p_org AND id IN (SELECT value::uuid FROM jsonb_array_elements_text(p_payload->'people')) ORDER BY id FOR UPDATE;
 PERFORM hub_lock_access(p_actor,p_org);
 IF NOT hub_is_admin(p_actor,p_org) AND (v_kind<>'award' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'people') item WHERE NOT hub_can_award(p_actor,p_org,item::uuid))) THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 IF NOT hub_is_admin(p_actor,p_org) AND v_activity IS NOT NULL AND NOT hub_can_view_activity(p_actor,p_org,v_activity) THEN RETURN jsonb_build_object('code','not_found'); END IF;
 IF NOT hub_is_admin(p_actor,p_org) AND v_session IS NOT NULL AND NOT hub_can_view_session(p_actor,p_org,v_activity,v_session) THEN RETURN jsonb_build_object('code','not_found'); END IF;
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

CREATE FUNCTION hub_is_admin(p_actor text,p_org uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin'));
$$;
--> statement-breakpoint
CREATE FUNCTION hub_active_access(p_actor text,p_org uuid) RETURNS SETOF hub_volunteer_assignments LANGUAGE sql STABLE AS $$
 SELECT v.* FROM hub_volunteer_assignments v JOIN hub_memberships m ON m.organization_id=v.organization_id AND m.user_id=v.user_id AND m.role='volunteer'
 WHERE v.organization_id=p_org AND v.user_id=p_actor AND v.revoked_at IS NULL
 AND (EXISTS(SELECT 1 FROM himmah.activity_groups g WHERE g.organization_id=p_org AND g.id=v.group_id AND NOT g.archived) OR EXISTS(SELECT 1 FROM hub_activities a WHERE a.organization_id=p_org AND a.id=v.activity_id AND NOT a.cancelled));
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
 SELECT hub_is_admin(p_actor,p_org) OR EXISTS(SELECT 1 FROM hub_active_access(p_actor,p_org) v JOIN hub_activity_sessions s ON s.organization_id=p_org AND s.activity_id=p_activity AND s.id=p_session WHERE v.can_attend AND (v.activity_id=p_activity OR (v.group_id IS NOT NULL AND (cardinality(s.audience_group_ids)=0 OR v.group_id=ANY(s.audience_group_ids)) AND EXISTS(SELECT 1 FROM himmah.activity_memberships gp WHERE gp.organization_id=p_org AND gp.group_id=v.group_id AND gp.person_id=p_person))));
$$;
--> statement-breakpoint
CREATE FUNCTION hub_can_view_group(p_actor text,p_org uuid,p_group uuid,p_activity uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT hub_is_admin(p_actor,p_org) OR EXISTS(SELECT 1 FROM hub_active_access(p_actor,p_org) WHERE group_id=p_group OR activity_id=p_activity);
$$;
--> statement-breakpoint
CREATE FUNCTION hub_lock_access(p_actor text,p_org uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM himmah.activity_groups WHERE organization_id=p_org AND id IN (SELECT group_id FROM hub_volunteer_assignments WHERE organization_id=p_org AND user_id=p_actor AND revoked_at IS NULL) ORDER BY id FOR SHARE;
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
  IF v_group IS NOT NULL THEN SELECT name INTO v_scope FROM himmah.activity_groups WHERE organization_id=p_org AND id=v_group AND NOT archived FOR SHARE;
  ELSE SELECT name INTO v_scope FROM hub_activities WHERE organization_id=p_org AND id=v_activity AND NOT cancelled FOR SHARE; END IF;
  IF v_scope IS NULL THEN RETURN jsonb_build_object('code','not_found'); END IF;
  INSERT INTO hub_volunteer_assignments(organization_id,user_id,staff_name,group_id,activity_id,scope_name,can_attend,created_by,creation_key)
  VALUES(p_org,p_payload->>'userId',v_name,v_group,v_activity,v_scope,(p_payload->>'canAttend')::boolean,p_actor,p_key) RETURNING * INTO v_new;
 ELSE
  SELECT * INTO v_old FROM hub_volunteer_assignments WHERE organization_id=p_org AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
  IF v_old.revoked_at IS NOT NULL THEN IF p_payload->>'action'='revoke' THEN RETURN jsonb_build_object('id',p_id); END IF; RETURN jsonb_build_object('code','conflict'); END IF;
  IF v_old.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RETURN jsonb_build_object('code','conflict'); END IF;
  IF p_payload->>'action'='revoke' THEN UPDATE hub_volunteer_assignments SET revoked_at=clock_timestamp(),revoked_by=p_actor,revoke_reason='manual',version=version+1 WHERE id=p_id RETURNING * INTO v_new;
  ELSIF p_payload->>'action'='edit' THEN UPDATE hub_volunteer_assignments SET can_attend=(p_payload->>'canAttend')::boolean,version=version+1 WHERE id=p_id RETURNING * INTO v_new;
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
CREATE TRIGGER hub_access_history_immutable BEFORE UPDATE OR DELETE ON hub_volunteer_assignment_changes FOR EACH ROW EXECUTE FUNCTION hub_history_immutable();

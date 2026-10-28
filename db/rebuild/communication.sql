-- Install after generated migrations, contacts.sql and directory.sql.
INSERT INTO himmah.contact_communication_preferences(organization_id,contact_id,created_by,updated_by)
SELECT organization_id,id,created_by,updated_by FROM himmah.contacts ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION himmah.initialize_communication_preferences() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,himmah AS $$
BEGIN
 INSERT INTO himmah.contact_communication_preferences(organization_id,contact_id,created_by,updated_by) VALUES(NEW.organization_id,NEW.id,NEW.created_by,NEW.updated_by);
 RETURN NEW;
END $$;
CREATE TRIGGER contact_communication_defaults AFTER INSERT ON himmah.contacts FOR EACH ROW EXECUTE FUNCTION himmah.initialize_communication_preferences();
CREATE OR REPLACE FUNCTION himmah.guard_communication_assignment() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,himmah AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'communication history is retained' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (OLD.valid_to IS NOT NULL OR NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.subject_contact_id<>OLD.subject_contact_id OR NEW.responsible_contact_id<>OLD.responsible_contact_id OR NEW.purpose<>OLD.purpose OR NEW.priority<>OLD.priority OR NEW.channel<>OLD.channel OR NEW.valid_from<>OLD.valid_from OR NEW.valid_to IS NULL OR NEW.created_at<>OLD.created_at OR NEW.created_by<>OLD.created_by) THEN RAISE EXCEPTION 'end and replace assignments' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER communication_assignment_guard BEFORE UPDATE OR DELETE ON himmah.communication_assignments FOR EACH ROW EXECUTE FUNCTION himmah.guard_communication_assignment();
CREATE OR REPLACE FUNCTION himmah.end_archived_communication() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,himmah AS $$
DECLARE a himmah.communication_assignments%ROWTYPE; c himmah.contacts%ROWTYPE;
BEGIN
 IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
  FOR a IN SELECT * FROM himmah.communication_assignments WHERE organization_id=NEW.organization_id AND NEW.id IN(subject_contact_id,responsible_contact_id) AND valid_to IS NULL ORDER BY id FOR UPDATE LOOP
   UPDATE himmah.communication_assignments SET valid_to=greatest(clock_timestamp(),valid_from+interval '1 microsecond'),end_reason='contact_archived',version=version+1,updated_at=clock_timestamp(),updated_by=NEW.archived_by WHERE id=a.id;
   IF a.subject_contact_id<>NEW.id THEN
    UPDATE himmah.contacts SET version=version+1,updated_at=clock_timestamp(),updated_by=NEW.archived_by WHERE id=a.subject_contact_id RETURNING * INTO c;
    INSERT INTO himmah.people_audit_events(organization_id,actor_id,contact_id,action,entity_version,changed_fields) VALUES(NEW.organization_id,NEW.archived_by,c.id,'communication_contact_archived',c.version,ARRAY['communication']);
   END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER contact_archive_communication AFTER UPDATE OF archived_at ON himmah.contacts FOR EACH ROW EXECUTE FUNCTION himmah.end_archived_communication();
CREATE OR REPLACE FUNCTION himmah.communication_command(p_actor text,p_org uuid,p_operation text,p_key uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,himmah AS $$
DECLARE c himmah.contacts%ROWTYPE; other himmah.contacts%ROWTYPE; a himmah.communication_assignments%ROWTYPE; receipt himmah.operation_receipts%ROWTYPE; hash text:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
BEGIN
 PERFORM 1 FROM himmah.organizations WHERE id=p_org FOR UPDATE;
 PERFORM 1 FROM himmah.staff_memberships WHERE organization_id=p_org AND user_id=p_actor AND active AND role IN('owner','admin') FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_forbidden'); END IF;
 IF p_key IS NULL OR p_operation NOT IN('communication_preferences','add_communication','end_communication') OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 SELECT * INTO receipt FROM himmah.operation_receipts WHERE organization_id=p_org AND actor_id=p_actor AND operation=p_operation AND request_key=p_key;
 IF FOUND THEN IF receipt.payload_hash<>hash THEN RETURN jsonb_build_object('code','request_key_conflict'); END IF; RETURN jsonb_build_object('id',receipt.contact_id,'replayed',true); END IF;
 SELECT * INTO c FROM himmah.contacts WHERE organization_id=p_org AND id=(p_payload->>'contactId')::uuid FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_forbidden'); END IF;
 IF c.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RETURN jsonb_build_object('code','version_conflict'); END IF;
 IF c.archived_at IS NOT NULL THEN RETURN jsonb_build_object('code','archived_reference'); END IF;
 IF p_operation='communication_preferences' THEN
  IF jsonb_typeof(p_payload->'routineDirectAllowed') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_payload->'emergencyDirectAllowed') IS DISTINCT FROM 'boolean' THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
  UPDATE himmah.contact_communication_preferences SET routine_direct_allowed=(p_payload->>'routineDirectAllowed')::boolean,emergency_direct_allowed=(p_payload->>'emergencyDirectAllowed')::boolean,version=version+1,updated_at=clock_timestamp(),updated_by=p_actor WHERE organization_id=p_org AND contact_id=c.id;
 ELSIF p_operation='add_communication' THEN
  SELECT * INTO other FROM himmah.contacts WHERE organization_id=p_org AND id=(p_payload->>'responsibleContactId')::uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_forbidden'); END IF;
  IF other.id=c.id THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
  IF other.archived_at IS NOT NULL THEN RETURN jsonb_build_object('code','archived_reference'); END IF;
  IF other.version IS DISTINCT FROM (p_payload->>'responsibleVersion')::integer THEN RETURN jsonb_build_object('code','version_conflict'); END IF;
  INSERT INTO himmah.communication_assignments(organization_id,subject_contact_id,responsible_contact_id,purpose,priority,channel,valid_from,created_by,updated_by) VALUES(p_org,c.id,other.id,p_payload->>'purpose',(p_payload->>'priority')::integer,p_payload->>'channel',clock_timestamp(),p_actor,p_actor);
 ELSE
  IF length(trim(coalesce(p_payload->>'reason',''))) NOT BETWEEN 1 AND 300 THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
  SELECT * INTO a FROM himmah.communication_assignments WHERE organization_id=p_org AND subject_contact_id=c.id AND id=(p_payload->>'assignmentId')::uuid AND valid_to IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_forbidden'); END IF;
  IF a.version IS DISTINCT FROM (p_payload->>'assignmentVersion')::integer THEN RETURN jsonb_build_object('code','version_conflict'); END IF;
  UPDATE himmah.communication_assignments SET valid_to=greatest(clock_timestamp(),valid_from+interval '1 microsecond'),end_reason=p_payload->>'reason',version=version+1,updated_at=clock_timestamp(),updated_by=p_actor WHERE id=a.id;
 END IF;
 UPDATE himmah.contacts SET version=version+1,updated_at=clock_timestamp(),updated_by=p_actor WHERE id=c.id RETURNING * INTO c;
 INSERT INTO himmah.people_audit_events(organization_id,actor_id,contact_id,action,entity_version,changed_fields) VALUES(p_org,p_actor,c.id,p_operation,c.version,ARRAY['communication']);
 INSERT INTO himmah.operation_receipts(organization_id,actor_id,operation,request_key,payload_hash,contact_id) VALUES(p_org,p_actor,p_operation,p_key,hash,c.id);
 RETURN jsonb_build_object('id',c.id,'replayed',false);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('code','duplicate_active_record'); WHEN check_violation OR invalid_text_representation OR not_null_violation THEN RETURN jsonb_build_object('code','invalid_input');
END $$;

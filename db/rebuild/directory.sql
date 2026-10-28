-- Load after ALL generated rebuild migrations and contacts.sql.
-- App commands serialize on the organization root; no transaction is split across HTTP calls.
CREATE OR REPLACE FUNCTION himmah.membership_interval_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,himmah AS $$
BEGIN
 PERFORM 1 FROM himmah.organizations WHERE id=NEW.organization_id FOR UPDATE;
 PERFORM 1 FROM himmah.groups WHERE organization_id=NEW.organization_id AND id=NEW.group_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM himmah.group_memberships m WHERE m.organization_id=NEW.organization_id AND m.group_id=NEW.group_id AND m.contact_id=NEW.contact_id AND m.id<>NEW.id AND tstzrange(m.valid_from,m.valid_to,'[)') && tstzrange(NEW.valid_from,NEW.valid_to,'[)')) THEN RAISE check_violation USING MESSAGE='membership_interval_overlap'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER membership_intervals BEFORE INSERT OR UPDATE ON himmah.group_memberships FOR EACH ROW EXECUTE FUNCTION himmah.membership_interval_guard();

CREATE OR REPLACE FUNCTION himmah.relationship_version_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,himmah AS $$
DECLARE labels jsonb; locale text;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE check_violation USING MESSAGE='immutable_relationship_version'; END IF;
 FOREACH labels IN ARRAY ARRAY[NEW.forward_labels,NEW.inverse_labels] LOOP
  IF jsonb_typeof(labels) IS DISTINCT FROM 'object' THEN RAISE check_violation; END IF;
  FOREACH locale IN ARRAY ARRAY['en','nl','tr'] LOOP
   IF jsonb_typeof(labels->locale) IS DISTINCT FROM 'string' OR length(trim(labels->>locale)) NOT BETWEEN 1 AND 80 OR (labels->>locale) ~ '[[:cntrl:]]' THEN RAISE check_violation; END IF;
  END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM himmah.relationship_types WHERE organization_id=NEW.organization_id AND id=NEW.type_id AND "symmetric") AND NEW.forward_labels<>NEW.inverse_labels THEN RAISE check_violation USING MESSAGE='symmetric_labels_differ'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER relationship_versions_immutable BEFORE INSERT OR UPDATE OR DELETE ON himmah.relationship_type_versions FOR EACH ROW EXECUTE FUNCTION himmah.relationship_version_guard();
CREATE OR REPLACE FUNCTION himmah.relationship_type_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (OLD.code,OLD.symmetric,OLD.category,OLD.organization_id) IS DISTINCT FROM (NEW.code,NEW.symmetric,NEW.category,NEW.organization_id) THEN RAISE check_violation USING MESSAGE='immutable_relationship_semantics'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER relationship_types_semantics BEFORE UPDATE ON himmah.relationship_types FOR EACH ROW EXECUTE FUNCTION himmah.relationship_type_guard();
CREATE OR REPLACE FUNCTION himmah.relationship_edge_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,himmah AS $$
DECLARE reciprocal boolean;
BEGIN
 PERFORM 1 FROM himmah.organizations WHERE id=NEW.organization_id FOR UPDATE;
 SELECT "symmetric" INTO reciprocal FROM himmah.relationship_types WHERE organization_id=NEW.organization_id AND id=NEW.type_id;
 IF reciprocal AND NEW.source_contact_id>NEW.target_contact_id THEN RAISE check_violation USING MESSAGE='noncanonical_symmetric_edge'; END IF;
 IF TG_OP='UPDATE' AND (OLD.organization_id,OLD.source_contact_id,OLD.target_contact_id,OLD.type_id,OLD.type_version_id,OLD.valid_from) IS DISTINCT FROM (NEW.organization_id,NEW.source_contact_id,NEW.target_contact_id,NEW.type_id,NEW.type_version_id,NEW.valid_from) THEN RAISE check_violation USING MESSAGE='immutable_relationship_assertion'; END IF;
 IF EXISTS(SELECT 1 FROM himmah.contact_relationships r WHERE r.organization_id=NEW.organization_id AND r.type_id=NEW.type_id AND r.source_contact_id=NEW.source_contact_id AND r.target_contact_id=NEW.target_contact_id AND r.id<>NEW.id AND tstzrange(r.valid_from,r.valid_to,'[)') && tstzrange(NEW.valid_from,NEW.valid_to,'[)')) THEN RAISE check_violation USING MESSAGE='relationship_interval_overlap'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER relationship_edges BEFORE INSERT OR UPDATE ON himmah.contact_relationships FOR EACH ROW EXECUTE FUNCTION himmah.relationship_edge_guard();

CREATE OR REPLACE FUNCTION himmah.seed_relationship_types(p_org uuid,p_actor text) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,himmah AS $$
DECLARE entry jsonb; type_id uuid;
BEGIN
 FOR entry IN SELECT value FROM jsonb_array_elements('[
 {"code":"father","forward":{"en":"Father","nl":"Vader","tr":"Baba"},"inverse":{"en":"Child","nl":"Kind","tr":"Çocuk"}},
 {"code":"mother","forward":{"en":"Mother","nl":"Moeder","tr":"Anne"},"inverse":{"en":"Child","nl":"Kind","tr":"Çocuk"}},
 {"code":"parent","forward":{"en":"Parent","nl":"Ouder","tr":"Ebeveyn"},"inverse":{"en":"Child","nl":"Kind","tr":"Çocuk"}},
 {"code":"sibling","forward":{"en":"Sibling","nl":"Broer/zus","tr":"Kardeş"},"inverse":{"en":"Sibling","nl":"Broer/zus","tr":"Kardeş"}},
 {"code":"guardian","forward":{"en":"Guardian","nl":"Voogd","tr":"Vasi"},"inverse":{"en":"Ward","nl":"Pupil","tr":"Vesayet altındaki kişi"}}
 ]'::jsonb) LOOP
  INSERT INTO himmah.relationship_types(organization_id,code,"symmetric",category,created_by,updated_by) VALUES(p_org,entry->>'code',entry->>'code'='sibling','family',p_actor,p_actor) ON CONFLICT(organization_id,code) DO NOTHING RETURNING id INTO type_id;
  IF type_id IS NOT NULL THEN INSERT INTO himmah.relationship_type_versions(organization_id,type_id,revision,forward_labels,inverse_labels,created_by) VALUES(p_org,type_id,1,entry->'forward',entry->'inverse',p_actor); END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION himmah.seed_new_organization_relationships() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,himmah AS $$ BEGIN PERFORM himmah.seed_relationship_types(NEW.id,NEW.created_by); RETURN NEW; END $$;
CREATE TRIGGER organization_relationship_defaults AFTER INSERT ON himmah.organizations FOR EACH ROW EXECUTE FUNCTION himmah.seed_new_organization_relationships();
SELECT himmah.seed_relationship_types(id,created_by) FROM himmah.organizations;

CREATE OR REPLACE FUNCTION himmah.end_contact_memberships() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,himmah AS $$
DECLARE membership himmah.group_memberships%ROWTYPE; v_group himmah.groups%ROWTYPE;
BEGIN
 IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL THEN
  FOR membership IN SELECT * FROM himmah.group_memberships WHERE organization_id=NEW.organization_id AND contact_id=NEW.id AND valid_to IS NULL ORDER BY group_id LOOP
   UPDATE himmah.group_memberships SET valid_to=greatest(clock_timestamp(),valid_from+interval '1 microsecond'),end_reason='contact_archived',version=version+1,updated_at=clock_timestamp(),updated_by=NEW.archived_by WHERE id=membership.id;
   UPDATE himmah.groups SET version=version+1,updated_at=clock_timestamp(),updated_by=NEW.archived_by WHERE organization_id=NEW.organization_id AND id=membership.group_id RETURNING * INTO v_group;
   INSERT INTO himmah.group_events(organization_id,group_id,contact_id,actor_id,action,reason,entity_version) VALUES(NEW.organization_id,membership.group_id,NEW.id,NEW.archived_by,'contact_archived','contact_archived',v_group.version);
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER contact_archive_memberships AFTER UPDATE OF archived_at ON himmah.contacts FOR EACH ROW EXECUTE FUNCTION himmah.end_contact_memberships();

CREATE OR REPLACE FUNCTION himmah.group_command(p_actor text,p_org uuid,p_operation text,p_key uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,himmah AS $$
DECLARE
 g himmah.groups%ROWTYPE; c himmah.contacts%ROWTYPE; m himmah.group_memberships%ROWTYPE; receipt himmah.group_operation_requests%ROWTYPE;
 item jsonb; result jsonb; outcomes jsonb:='[]'; saved integer:=0; hash text:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
BEGIN
 PERFORM 1 FROM himmah.organizations WHERE id=p_org FOR UPDATE;
 PERFORM 1 FROM himmah.staff_memberships WHERE organization_id=p_org AND user_id=p_actor AND active AND role IN ('owner','admin') FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_forbidden'); END IF;
 IF p_key IS NULL OR p_operation NOT IN ('create','update','archive','restore','assign','end_membership') OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 SELECT * INTO receipt FROM himmah.group_operation_requests WHERE organization_id=p_org AND actor_id=p_actor AND operation=p_operation AND request_key=p_key;
 IF FOUND THEN
  IF receipt.payload_hash<>hash THEN RETURN jsonb_build_object('code','request_key_conflict'); END IF;
  RETURN receipt.response || jsonb_build_object('replayed',true);
 END IF;
 IF p_operation='create' THEN
  INSERT INTO himmah.groups(organization_id,name,description,created_by,updated_by) VALUES(p_org,p_payload->>'name',p_payload->>'description',p_actor,p_actor) RETURNING * INTO g;
 ELSE
  SELECT * INTO g FROM himmah.groups WHERE organization_id=p_org AND id=(p_payload->>'groupId')::uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_forbidden'); END IF;
  IF g.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RETURN jsonb_build_object('code','version_conflict'); END IF;
  IF p_operation<>'restore' AND g.archived_at IS NOT NULL THEN RETURN jsonb_build_object('code','archived_reference'); END IF;
  IF p_operation='restore' AND g.archived_at IS NULL THEN RETURN jsonb_build_object('code','version_conflict'); END IF;
  IF p_operation='update' THEN UPDATE himmah.groups SET name=p_payload->>'name',description=p_payload->>'description' WHERE id=g.id;
  ELSIF p_operation IN ('archive','restore') THEN
   UPDATE himmah.groups SET archived_at=CASE WHEN p_operation='archive' THEN clock_timestamp() ELSE NULL END,archived_by=CASE WHEN p_operation='archive' THEN p_actor ELSE NULL END WHERE id=g.id;
   IF p_operation='archive' THEN
    FOR m IN SELECT * FROM himmah.group_memberships WHERE organization_id=p_org AND group_id=g.id AND valid_to IS NULL ORDER BY contact_id LOOP
     UPDATE himmah.group_memberships SET valid_to=greatest(clock_timestamp(),valid_from+interval '1 microsecond'),end_reason='group_archived',version=version+1,updated_at=clock_timestamp(),updated_by=p_actor WHERE id=m.id;
     UPDATE himmah.contacts SET version=version+1,updated_at=clock_timestamp(),updated_by=p_actor WHERE organization_id=p_org AND id=m.contact_id RETURNING * INTO c;
     INSERT INTO himmah.people_audit_events(organization_id,actor_id,contact_id,action,entity_version,changed_fields) VALUES(p_org,p_actor,c.id,'group_archived',c.version,ARRAY['memberships']);
    END LOOP;
   END IF;
  ELSIF p_operation='assign' THEN
   IF jsonb_typeof(p_payload->'contacts') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'contacts') NOT BETWEEN 1 AND 50 OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_payload->'contacts'))<>jsonb_array_length(p_payload->'contacts') THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'contacts') ORDER BY value->>'id' LOOP
    SELECT * INTO c FROM himmah.contacts WHERE organization_id=p_org AND id=(item->>'id')::uuid FOR UPDATE;
    IF NOT FOUND THEN outcomes:=outcomes||jsonb_build_array(jsonb_build_object('id',item->>'id','outcome','not_found_or_forbidden')); CONTINUE; END IF;
    IF c.archived_at IS NOT NULL THEN outcomes:=outcomes||jsonb_build_array(jsonb_build_object('id',c.id,'outcome','archived_reference')); CONTINUE; END IF;
    IF EXISTS(SELECT 1 FROM himmah.group_memberships WHERE organization_id=p_org AND group_id=g.id AND contact_id=c.id AND valid_to IS NULL) THEN outcomes:=outcomes||jsonb_build_array(jsonb_build_object('id',c.id,'outcome','already_member')); CONTINUE; END IF;
    IF c.version IS DISTINCT FROM (item->>'version')::integer THEN outcomes:=outcomes||jsonb_build_array(jsonb_build_object('id',c.id,'outcome','version_conflict')); CONTINUE; END IF;
    INSERT INTO himmah.group_memberships(organization_id,group_id,contact_id,valid_from,created_by,updated_by) VALUES(p_org,g.id,c.id,clock_timestamp(),p_actor,p_actor);
    UPDATE himmah.contacts SET version=version+1,updated_at=clock_timestamp(),updated_by=p_actor WHERE id=c.id RETURNING * INTO c;
    INSERT INTO himmah.people_audit_events(organization_id,actor_id,contact_id,action,entity_version,changed_fields) VALUES(p_org,p_actor,c.id,'group_joined',c.version,ARRAY['memberships']);
    INSERT INTO himmah.group_events(organization_id,group_id,contact_id,actor_id,action,entity_version) VALUES(p_org,g.id,c.id,p_actor,'member_added',g.version+1);
    saved:=saved+1;outcomes:=outcomes||jsonb_build_array(jsonb_build_object('id',c.id,'outcome','saved'));
   END LOOP;
  ELSIF p_operation='end_membership' THEN
   IF length(trim(coalesce(p_payload->>'reason',''))) NOT BETWEEN 1 AND 300 THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
   SELECT * INTO m FROM himmah.group_memberships WHERE organization_id=p_org AND group_id=g.id AND id=(p_payload->>'membershipId')::uuid AND valid_to IS NULL FOR UPDATE;
   IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_forbidden'); END IF;
   IF m.version IS DISTINCT FROM (p_payload->>'membershipVersion')::integer THEN RETURN jsonb_build_object('code','version_conflict'); END IF;
   UPDATE himmah.group_memberships SET valid_to=greatest(clock_timestamp(),valid_from+interval '1 microsecond'),end_reason=p_payload->>'reason',version=version+1,updated_at=clock_timestamp(),updated_by=p_actor WHERE id=m.id;
   UPDATE himmah.contacts SET version=version+1,updated_at=clock_timestamp(),updated_by=p_actor WHERE organization_id=p_org AND id=m.contact_id RETURNING * INTO c;
   INSERT INTO himmah.people_audit_events(organization_id,actor_id,contact_id,action,entity_version,changed_fields) VALUES(p_org,p_actor,c.id,'group_left',c.version,ARRAY['memberships']);
  END IF;
  IF p_operation<>'assign' OR saved>0 THEN UPDATE himmah.groups SET version=version+1,updated_at=clock_timestamp(),updated_by=p_actor WHERE id=g.id RETURNING * INTO g; END IF;
 END IF;
 IF p_operation<>'assign' THEN INSERT INTO himmah.group_events(organization_id,group_id,contact_id,actor_id,action,reason,entity_version) VALUES(p_org,g.id,CASE WHEN p_operation='end_membership' THEN m.contact_id ELSE NULL END,p_actor,p_operation,p_payload->>'reason',g.version); END IF;
 result:=jsonb_build_object('id',g.id,'version',g.version,'outcomes',outcomes,'replayed',false);
 INSERT INTO himmah.group_operation_requests(organization_id,actor_id,operation,request_key,payload_hash,group_id,response) VALUES(p_org,p_actor,p_operation,p_key,hash,g.id,result);
 RETURN result;
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('code','duplicate_active_record'); WHEN check_violation OR invalid_text_representation OR not_null_violation THEN RETURN jsonb_build_object('code','invalid_input');
END $$;

CREATE OR REPLACE FUNCTION himmah.relationship_type_command(p_actor text,p_org uuid,p_operation text,p_key uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,himmah AS $$
DECLARE t himmah.relationship_types%ROWTYPE; receipt himmah.relationship_type_requests%ROWTYPE; hash text:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
BEGIN
 PERFORM 1 FROM himmah.organizations WHERE id=p_org FOR UPDATE;
 PERFORM 1 FROM himmah.staff_memberships WHERE organization_id=p_org AND user_id=p_actor AND active AND role IN ('owner','admin') FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_forbidden'); END IF;
 IF p_operation NOT IN ('create','publish','archive','restore') OR p_key IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 SELECT * INTO receipt FROM himmah.relationship_type_requests WHERE organization_id=p_org AND actor_id=p_actor AND operation=p_operation AND request_key=p_key;
 IF FOUND THEN IF receipt.payload_hash<>hash THEN RETURN jsonb_build_object('code','request_key_conflict'); END IF; RETURN jsonb_build_object('id',receipt.type_id,'replayed',true); END IF;
 IF p_operation='create' THEN
  INSERT INTO himmah.relationship_types(organization_id,code,"symmetric",category,created_by,updated_by) VALUES(p_org,'custom_'||replace(p_key::text,'-',''),(p_payload->>'symmetric')::boolean,p_payload->>'category',p_actor,p_actor) RETURNING * INTO t;
 ELSE
  SELECT * INTO t FROM himmah.relationship_types WHERE organization_id=p_org AND id=(p_payload->>'typeId')::uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_forbidden'); END IF;
  IF t.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RETURN jsonb_build_object('code','version_conflict'); END IF;
  IF p_operation<>'restore' AND t.archived_at IS NOT NULL THEN RETURN jsonb_build_object('code','archived_reference'); END IF;
  IF p_operation='restore' AND t.archived_at IS NULL THEN RETURN jsonb_build_object('code','version_conflict'); END IF;
  UPDATE himmah.relationship_types SET version=version+1,updated_at=clock_timestamp(),updated_by=p_actor,archived_at=CASE WHEN p_operation='archive' THEN clock_timestamp() WHEN p_operation='restore' THEN NULL ELSE archived_at END,archived_by=CASE WHEN p_operation='archive' THEN p_actor WHEN p_operation='restore' THEN NULL ELSE archived_by END WHERE id=t.id RETURNING * INTO t;
 END IF;
 IF p_operation IN ('create','publish') THEN
  INSERT INTO himmah.relationship_type_versions(organization_id,type_id,revision,forward_labels,inverse_labels,created_by)
  SELECT p_org,t.id,coalesce(max(revision),0)+1,p_payload->'forwardLabels',p_payload->'inverseLabels',p_actor FROM himmah.relationship_type_versions WHERE organization_id=p_org AND type_id=t.id;
 END IF;
 INSERT INTO himmah.relationship_type_events(organization_id,type_id,actor_id,action,entity_version) VALUES(p_org,t.id,p_actor,p_operation,t.version);
 INSERT INTO himmah.relationship_type_requests(organization_id,actor_id,operation,request_key,payload_hash,type_id) VALUES(p_org,p_actor,p_operation,p_key,hash,t.id);
 RETURN jsonb_build_object('id',t.id,'replayed',false);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('code','duplicate_active_record'); WHEN check_violation OR invalid_text_representation OR not_null_violation THEN RETURN jsonb_build_object('code','invalid_input');
END $$;

CREATE OR REPLACE FUNCTION himmah.relationship_command(p_actor text,p_org uuid,p_operation text,p_key uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,himmah AS $$
DECLARE c himmah.contacts%ROWTYPE; other himmah.contacts%ROWTYPE; t himmah.relationship_types%ROWTYPE; v himmah.relationship_type_versions%ROWTYPE; edge himmah.contact_relationships%ROWTYPE; receipt himmah.operation_receipts%ROWTYPE; source_id uuid; target_id uuid; hash text:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
BEGIN
 PERFORM 1 FROM himmah.organizations WHERE id=p_org FOR UPDATE;
 PERFORM 1 FROM himmah.staff_memberships WHERE organization_id=p_org AND user_id=p_actor AND active AND role IN ('owner','admin') FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_forbidden'); END IF;
 IF p_key IS NULL OR p_operation NOT IN ('add_relationship','end_relationship') OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 SELECT * INTO receipt FROM himmah.operation_receipts WHERE organization_id=p_org AND actor_id=p_actor AND operation=p_operation AND request_key=p_key;
 IF FOUND THEN IF receipt.payload_hash<>hash THEN RETURN jsonb_build_object('code','request_key_conflict'); END IF; RETURN jsonb_build_object('id',receipt.contact_id,'replayed',true); END IF;
 SELECT * INTO c FROM himmah.contacts WHERE organization_id=p_org AND id=(p_payload->>'contactId')::uuid FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_forbidden'); END IF;
 IF c.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RETURN jsonb_build_object('code','version_conflict'); END IF;
 IF c.archived_at IS NOT NULL THEN RETURN jsonb_build_object('code','archived_reference'); END IF;
 IF p_operation='add_relationship' THEN
  SELECT * INTO other FROM himmah.contacts WHERE organization_id=p_org AND id=(p_payload->>'otherContactId')::uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_forbidden'); END IF;
  IF other.id=c.id THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
  IF other.archived_at IS NOT NULL THEN RETURN jsonb_build_object('code','archived_reference'); END IF;
  IF other.version IS DISTINCT FROM (p_payload->>'otherVersion')::integer THEN RETURN jsonb_build_object('code','version_conflict'); END IF;
  SELECT * INTO t FROM himmah.relationship_types WHERE organization_id=p_org AND id=(p_payload->>'typeId')::uuid;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_forbidden'); END IF;
  IF t.archived_at IS NOT NULL THEN RETURN jsonb_build_object('code','archived_reference'); END IF;
  SELECT * INTO v FROM himmah.relationship_type_versions WHERE organization_id=p_org AND type_id=t.id ORDER BY revision DESC LIMIT 1;
  IF v.id IS DISTINCT FROM (p_payload->>'typeVersionId')::uuid THEN RETURN jsonb_build_object('code','version_conflict'); END IF;
  IF p_payload->>'direction' NOT IN ('subject_is_role','other_is_role') OR p_payload->>'direction' IS NULL THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
  source_id:=CASE WHEN p_payload->>'direction'='subject_is_role' THEN c.id ELSE other.id END;
  target_id:=CASE WHEN source_id=c.id THEN other.id ELSE c.id END;
  IF t.symmetric THEN source_id:=least(c.id,other.id); target_id:=greatest(c.id,other.id); END IF;
  IF EXISTS(SELECT 1 FROM himmah.contact_relationships WHERE organization_id=p_org AND type_id=t.id AND source_contact_id=source_id AND target_contact_id=target_id AND valid_to IS NULL) THEN RETURN jsonb_build_object('code','duplicate_active_record'); END IF;
  INSERT INTO himmah.contact_relationships(organization_id,source_contact_id,target_contact_id,type_id,type_version_id,valid_from,created_by,updated_by) VALUES(p_org,source_id,target_id,t.id,v.id,clock_timestamp(),p_actor,p_actor) RETURNING * INTO edge;
 ELSE
  IF length(trim(coalesce(p_payload->>'reason',''))) NOT BETWEEN 1 AND 300 THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
  SELECT * INTO edge FROM himmah.contact_relationships WHERE organization_id=p_org AND id=(p_payload->>'relationshipId')::uuid AND c.id IN (source_contact_id,target_contact_id) AND valid_to IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_forbidden'); END IF;
  IF edge.version IS DISTINCT FROM (p_payload->>'relationshipVersion')::integer THEN RETURN jsonb_build_object('code','version_conflict'); END IF;
  SELECT * INTO other FROM himmah.contacts WHERE organization_id=p_org AND id=CASE WHEN edge.source_contact_id=c.id THEN edge.target_contact_id ELSE edge.source_contact_id END FOR UPDATE;
  UPDATE himmah.contact_relationships SET valid_to=greatest(clock_timestamp(),valid_from+interval '1 microsecond'),end_reason=p_payload->>'reason',version=version+1,updated_at=clock_timestamp(),updated_by=p_actor WHERE id=edge.id;
 END IF;
 UPDATE himmah.contacts SET version=version+1,updated_at=clock_timestamp(),updated_by=p_actor WHERE id=c.id RETURNING * INTO c;
 UPDATE himmah.contacts SET version=version+1,updated_at=clock_timestamp(),updated_by=p_actor WHERE id=other.id RETURNING * INTO other;
 INSERT INTO himmah.people_audit_events(organization_id,actor_id,contact_id,action,entity_version,changed_fields) VALUES(p_org,p_actor,c.id,p_operation,c.version,ARRAY['relationships']),(p_org,p_actor,other.id,p_operation,other.version,ARRAY['relationships']);
 INSERT INTO himmah.operation_receipts(organization_id,actor_id,operation,request_key,payload_hash,contact_id) VALUES(p_org,p_actor,p_operation,p_key,hash,c.id);
 RETURN jsonb_build_object('id',c.id,'relationshipId',edge.id,'replayed',false);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('code','duplicate_active_record'); WHEN check_violation OR invalid_text_representation OR not_null_violation THEN RETURN jsonb_build_object('code','invalid_input');
END $$;

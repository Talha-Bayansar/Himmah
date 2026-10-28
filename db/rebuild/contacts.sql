-- Applied after the generated rebuild baseline, only to verified Himmah development.
-- Each command is one database transaction, including access check, receipt and audit.
CREATE OR REPLACE FUNCTION himmah.contact_command(p_actor text,p_org uuid,p_operation text,p_key uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog, himmah AS $$
DECLARE
 v_contact himmah.contacts%ROWTYPE;
 v_receipt himmah.operation_receipts%ROWTYPE;
 v_method himmah.contact_methods%ROWTYPE;
 v_hash text := encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 v_id uuid;
 v_fields text[];
BEGIN
 PERFORM 1 FROM himmah.organizations WHERE id=p_org FOR UPDATE;
 PERFORM 1 FROM himmah.staff_memberships WHERE organization_id=p_org AND user_id=p_actor AND active AND role IN ('owner','admin') FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_forbidden'); END IF;
 IF p_operation NOT IN ('create','update','archive','restore','add_method','replace_method','end_method') OR p_key IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
 RETURN jsonb_build_object('code','invalid_input'); END IF;
 SELECT * INTO v_receipt FROM himmah.operation_receipts WHERE organization_id=p_org AND actor_id=p_actor AND operation=p_operation AND request_key=p_key;
 IF FOUND THEN
  IF v_receipt.payload_hash <> v_hash THEN RETURN jsonb_build_object('code','request_key_conflict'); END IF;
  RETURN jsonb_build_object('id',v_receipt.contact_id,'replayed',true);
 END IF;
 IF p_operation='create' THEN
  INSERT INTO himmah.contacts(organization_id,display_name,given_name,family_name,created_by,updated_by)
  VALUES(p_org,p_payload->>'displayName',p_payload->>'givenName',p_payload->>'familyName',p_actor,p_actor) RETURNING * INTO v_contact;
  v_fields:=ARRAY['displayName','givenName','familyName'];
 ELSE
  SELECT * INTO v_contact FROM himmah.contacts WHERE organization_id=p_org AND id=(p_payload->>'contactId')::uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_forbidden'); END IF;
  IF v_contact.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RETURN jsonb_build_object('code','version_conflict'); END IF;
  IF p_operation <> 'restore' AND v_contact.archived_at IS NOT NULL THEN RETURN jsonb_build_object('code','archived_reference'); END IF;
  IF p_operation='restore' AND v_contact.archived_at IS NULL THEN RETURN jsonb_build_object('code','version_conflict'); END IF;
  IF p_operation='update' THEN
   UPDATE himmah.contacts SET display_name=p_payload->>'displayName',given_name=p_payload->>'givenName',family_name=p_payload->>'familyName' WHERE id=v_contact.id;
   v_fields:=ARRAY['displayName','givenName','familyName'];
  ELSIF p_operation IN ('archive','restore') THEN
   UPDATE himmah.contacts SET archived_at=CASE WHEN p_operation='archive' THEN now() ELSE NULL END,archived_by=CASE WHEN p_operation='archive' THEN p_actor ELSE NULL END WHERE id=v_contact.id;
   v_fields:=ARRAY['archivedAt'];
  ELSIF p_operation IN ('add_method','replace_method') THEN
   IF p_operation='replace_method' THEN
    UPDATE himmah.contact_methods SET ended_at=now(),preferred=false,version=version+1,updated_at=now(),updated_by=p_actor
    WHERE organization_id=p_org AND contact_id=v_contact.id AND id=(p_payload->>'methodId')::uuid AND ended_at IS NULL RETURNING * INTO v_method;
    IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_forbidden'); END IF;
   END IF;
   IF (p_payload->>'preferred')::boolean THEN
    UPDATE himmah.contact_methods SET preferred=false,version=version+1,updated_at=now(),updated_by=p_actor WHERE organization_id=p_org AND contact_id=v_contact.id AND kind=p_payload->>'kind' AND preferred AND ended_at IS NULL;
   END IF;
   INSERT INTO himmah.contact_methods(organization_id,contact_id,kind,value,normalized_value,preferred,created_by,updated_by)
   VALUES(p_org,v_contact.id,p_payload->>'kind',p_payload->>'value',p_payload->>'normalizedValue',(p_payload->>'preferred')::boolean,p_actor,p_actor);
   v_fields:=ARRAY['methods'];
  ELSIF p_operation='end_method' THEN
   UPDATE himmah.contact_methods SET ended_at=now(),preferred=false,version=version+1,updated_at=now(),updated_by=p_actor
   WHERE organization_id=p_org AND contact_id=v_contact.id AND id=(p_payload->>'methodId')::uuid AND ended_at IS NULL RETURNING * INTO v_method;
   IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_forbidden'); END IF;
   v_fields:=ARRAY['methods'];
  END IF;
  UPDATE himmah.contacts SET version=version+1,updated_at=now(),updated_by=p_actor WHERE id=v_contact.id RETURNING * INTO v_contact;
 END IF;
 INSERT INTO himmah.people_audit_events(organization_id,actor_id,contact_id,action,entity_version,changed_fields)
 VALUES(p_org,p_actor,v_contact.id,p_operation,v_contact.version,v_fields);
 INSERT INTO himmah.operation_receipts(organization_id,actor_id,operation,request_key,payload_hash,contact_id)
 VALUES(p_org,p_actor,p_operation,p_key,v_hash,v_contact.id);
 RETURN jsonb_build_object('id',v_contact.id,'replayed',false);
EXCEPTION
 WHEN unique_violation THEN RETURN jsonb_build_object('code','duplicate_active_record');
 WHEN check_violation OR invalid_text_representation OR not_null_violation THEN RETURN jsonb_build_object('code','invalid_input');
END $$;

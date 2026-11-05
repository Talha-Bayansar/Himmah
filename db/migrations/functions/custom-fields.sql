-- Tenant-owned bounded definitions. No contact/participation/money side effects.
CREATE FUNCTION himmah.custom_field_config(p_org uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('fields',v,'snapshot',md5(v::text)) FROM (
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'kind',kind,'required',required,'options',options,'version',version,'archivedAt',archived_at) ORDER BY created_at,id),'[]'::jsonb) v FROM himmah.contact_custom_fields WHERE organization_id=p_org) x;
$$;
--> statement-breakpoint
CREATE FUNCTION himmah.custom_values_valid(p_org uuid,p_values jsonb,p_previous jsonb DEFAULT '{}'::jsonb) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE f record; item record; v jsonb; date_value date;
BEGIN
 IF jsonb_typeof(p_values) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_values))>50 THEN RETURN false; END IF;
 FOR item IN SELECT key,value FROM jsonb_each(p_values) LOOP
  SELECT * INTO f FROM himmah.contact_custom_fields WHERE organization_id=p_org AND id::text=item.key;
  IF NOT FOUND THEN RETURN false; END IF;
  IF f.archived_at IS NOT NULL AND item.value IS DISTINCT FROM p_previous->item.key THEN RETURN false; END IF;
 END LOOP;
 FOR f IN SELECT * FROM himmah.contact_custom_fields WHERE organization_id=p_org AND archived_at IS NULL LOOP
  v:=p_values->f.id::text;
  IF v IS NULL OR v='""'::jsonb THEN IF f.required THEN RETURN false; END IF; CONTINUE; END IF;
  IF f.kind='text' AND (jsonb_typeof(v)<>'string' OR length(v#>>'{}')>1000 OR (f.required AND length(trim(v#>>'{}'))=0) OR (v#>>'{}') ~ '[[:cntrl:]]') THEN RETURN false;
  ELSIF f.kind='number' THEN IF jsonb_typeof(v)<>'number' THEN RETURN false; END IF; IF abs((v#>>'{}')::numeric)>1000000000000 THEN RETURN false; END IF;
  ELSIF f.kind='boolean' AND jsonb_typeof(v)<>'boolean' THEN RETURN false;
  ELSIF f.kind='choice' AND (jsonb_typeof(v)<>'string' OR NOT f.options @> jsonb_build_array(v)) THEN RETURN false;
  ELSIF f.kind='date' THEN
   IF jsonb_typeof(v)<>'string' OR (v#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN false; END IF;
   date_value:=(v#>>'{}')::date;
   IF to_char(date_value,'YYYY-MM-DD')<>v#>>'{}' THEN RETURN false; END IF;
  END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $$;
--> statement-breakpoint
CREATE FUNCTION himmah.custom_field_command(p_actor text,p_org uuid,p_key uuid,p_body jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,himmah,public AS $$
DECLARE f himmah.contact_custom_fields%ROWTYPE; r himmah.contact_field_receipts%ROWTYPE; outcome jsonb; v_id uuid; op text:=p_body->>'operation';
BEGIN
 PERFORM 1 FROM himmah.organizations WHERE id=p_org FOR UPDATE;
 PERFORM 1 FROM himmah.staff_memberships WHERE organization_id=p_org AND user_id=p_actor AND active AND role IN ('owner','admin') FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_forbidden'); END IF;
 SELECT * INTO r FROM himmah.contact_field_receipts WHERE organization_id=p_org AND actor_id=p_actor AND request_key=p_key;
 IF FOUND THEN IF r.payload IS DISTINCT FROM p_body THEN RETURN jsonb_build_object('code','request_key_conflict'); END IF; RETURN r.result||'{"replayed":true}'::jsonb; END IF;
 IF p_key IS NULL OR op NOT IN ('create','update','archive','restore') OR op IS NULL THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 IF op IN ('create','update') THEN
  IF jsonb_typeof(p_body->'label') IS DISTINCT FROM 'string' OR length(trim(p_body->>'label')) NOT BETWEEN 1 AND 100 OR (p_body->>'label') ~ '[[:cntrl:]]' OR p_body->>'kind' NOT IN ('text','number','date','boolean','choice') OR jsonb_typeof(p_body->'required') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_body->'options') IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
  IF jsonb_array_length(p_body->'options')>30 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_body->'options') v WHERE jsonb_typeof(v)<>'string' OR length(trim(v#>>'{}')) NOT BETWEEN 1 AND 100 OR (v#>>'{}') ~ '[[:cntrl:]]') OR (SELECT count(*)<>count(distinct value) FROM jsonb_array_elements(p_body->'options')) OR (CASE WHEN p_body->>'kind'='choice' THEN jsonb_array_length(p_body->'options')<2 ELSE jsonb_array_length(p_body->'options')<>0 END) THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 END IF;
 IF op='create' THEN
  IF (SELECT count(*) FROM himmah.contact_custom_fields WHERE organization_id=p_org)>=50 THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
  INSERT INTO himmah.contact_custom_fields(organization_id,label,kind,required,options,created_by,updated_by) VALUES(p_org,trim(p_body->>'label'),p_body->>'kind',(p_body->>'required')::boolean,p_body->'options',p_actor,p_actor) RETURNING id INTO v_id;
 ELSE
  SELECT * INTO f FROM himmah.contact_custom_fields WHERE organization_id=p_org AND id=(p_body->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_forbidden'); END IF;
  IF f.version IS DISTINCT FROM (p_body->>'version')::int THEN RETURN jsonb_build_object('code','version_conflict'); END IF;
  IF op='update' AND (f.archived_at IS NOT NULL OR f.kind IS DISTINCT FROM p_body->>'kind' OR f.options IS DISTINCT FROM p_body->'options') THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
  IF (op='archive' AND f.archived_at IS NOT NULL) OR (op='restore' AND f.archived_at IS NULL) THEN RETURN jsonb_build_object('code','version_conflict'); END IF;
  UPDATE himmah.contact_custom_fields SET label=CASE WHEN op='update' THEN trim(p_body->>'label') ELSE label END,required=CASE WHEN op='update' THEN (p_body->>'required')::boolean ELSE required END,archived_at=CASE WHEN op='archive' THEN now() WHEN op='restore' THEN NULL ELSE archived_at END,version=version+1,updated_at=now(),updated_by=p_actor WHERE id=f.id;
  v_id:=f.id;
 END IF;
 INSERT INTO public.hub_directory_audit(organization_id,actor_id,action,entity_id) VALUES(p_org,p_actor,'contact_field.'||op,v_id::text);
 outcome:=jsonb_build_object('id',v_id,'replayed',false);
 INSERT INTO himmah.contact_field_receipts(organization_id,actor_id,request_key,payload,result) VALUES(p_org,p_actor,p_key,p_body,outcome);
 RETURN outcome;
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('code','duplicate_active_record'); WHEN check_violation OR invalid_text_representation OR not_null_violation THEN RETURN jsonb_build_object('code','invalid_input');
END $$;

--> statement-breakpoint
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
 v_previous jsonb;
 v_custom jsonb;
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
 IF p_operation IN ('create','update') THEN
  SELECT coalesce(values,'{}'::jsonb) INTO v_previous FROM himmah.contact_custom_values WHERE organization_id=p_org AND contact_id=(p_payload->>'contactId')::uuid;
  v_previous:=coalesce(v_previous,'{}'::jsonb);
  v_custom:=coalesce((SELECT jsonb_object_agg(item.key,item.value) FROM jsonb_each(v_previous) item JOIN himmah.contact_custom_fields field ON field.organization_id=p_org AND field.id::text=item.key AND field.archived_at IS NOT NULL),'{}'::jsonb)||coalesce(p_payload->'customValues',v_previous);
  IF EXISTS(SELECT 1 FROM himmah.contact_custom_fields WHERE organization_id=p_org) AND p_payload->>'customFieldsSnapshot' IS DISTINCT FROM himmah.custom_field_config(p_org)->>'snapshot' THEN RETURN jsonb_build_object('code','version_conflict'); END IF;
  IF NOT himmah.custom_values_valid(p_org,v_custom,v_previous) THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
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
 IF p_operation IN ('create','update') THEN
  INSERT INTO himmah.contact_custom_values(organization_id,contact_id,values) VALUES(p_org,v_contact.id,v_custom) ON CONFLICT(organization_id,contact_id) DO UPDATE SET values=excluded.values;
  v_fields:=v_fields||ARRAY['customValues'];
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

--> statement-breakpoint
CREATE OR REPLACE FUNCTION himmah.contact_import_review(p_actor text,p_org uuid,p_rows jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE review jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM himmah.staff_memberships WHERE organization_id=p_org AND user_id=p_actor AND active AND role IN ('owner','admin')) THEN RETURN NULL; END IF;
 IF NOT himmah.contact_import_rows_valid(p_rows) THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) r WHERE NOT himmah.custom_values_valid(p_org,coalesce(r->'customValues','{}'::jsonb))) THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 WITH source AS (SELECT value r FROM jsonb_array_elements(p_rows)),
 reviewed AS (
 SELECT (r->>'row')::int n,
 (SELECT jsonb_build_object('count',count(*),'fingerprint',md5(coalesce(string_agg(jsonb_build_array(c.id,c.version,c.display_name,c.archived_at)::text,'' ORDER BY c.id),'')),
 'matches',coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.display_name,'version',c.version,'archived',c.archived_at IS NOT NULL) ORDER BY c.id) FILTER(WHERE c.position<=3),'[]'::jsonb))
 FROM (SELECT candidate.*,row_number() OVER(ORDER BY candidate.id) position FROM (
 SELECT c.id,c.display_name,c.version,c.archived_at FROM himmah.contacts c WHERE c.organization_id=p_org AND himmah.contact_import_name(c.display_name)=himmah.contact_import_name(r->>'displayName')
 UNION
 SELECT c.id,c.display_name,c.version,c.archived_at FROM jsonb_array_elements(r->'methods') incoming
 JOIN himmah.contact_methods m ON m.organization_id=p_org AND m.kind=incoming->>'kind' AND m.normalized_value=incoming->>'normalizedValue' AND m.ended_at IS NULL
 JOIN himmah.contacts c ON c.organization_id=m.organization_id AND c.id=m.contact_id
 ) candidate) c) candidates,
 (SELECT coalesce(jsonb_agg((other.r->>'row')::int ORDER BY (other.r->>'row')::int),'[]'::jsonb) FROM source other WHERE other.r->>'row'<>source.r->>'row' AND
 (himmah.contact_import_name(other.r->>'displayName')=himmah.contact_import_name(source.r->>'displayName') OR EXISTS(
 SELECT 1 FROM jsonb_array_elements(other.r->'methods') a JOIN jsonb_array_elements(source.r->'methods') b ON a->>'kind'=b->>'kind' AND a->>'normalizedValue'=b->>'normalizedValue'))) file_matches
 FROM source)
 SELECT jsonb_build_object('snapshot',md5(himmah.custom_field_config(p_org)::text||p_rows::text||coalesce(jsonb_agg(jsonb_build_array(n,candidates,file_matches) ORDER BY n),'[]'::jsonb)::text),
 'rows',coalesce(jsonb_agg(jsonb_build_object('row',n,'matchCount',(candidates->>'count')::int,'matches',candidates->'matches',
 'fileMatches',(SELECT coalesce(jsonb_agg(value),'[]'::jsonb) FROM (SELECT value FROM jsonb_array_elements(file_matches) LIMIT 5) bounded_file),'fileMatchCount',jsonb_array_length(file_matches)) ORDER BY n),'[]'::jsonb)) INTO review FROM reviewed;
 RETURN review;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION himmah.contact_import(p_actor text,p_org uuid,p_key uuid,p_rows jsonb,p_selected jsonb,p_snapshot text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE receipt himmah.contact_import_receipts%ROWTYPE; review jsonb; hash text; r jsonb; m jsonb; contact uuid; created integer:=0; outcome jsonb;
BEGIN
 -- Same organization lock as ordinary contact commands: match checks and inserts cannot race.
 PERFORM 1 FROM himmah.organizations WHERE id=p_org FOR UPDATE;
 PERFORM 1 FROM himmah.staff_memberships WHERE organization_id=p_org AND user_id=p_actor AND active AND role IN ('owner','admin') FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_forbidden'); END IF;
 IF p_key IS NULL OR NOT himmah.contact_import_rows_valid(p_rows) OR p_snapshot IS NULL OR p_snapshot !~ '^[a-f0-9]{32}$' OR jsonb_typeof(p_selected) IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 IF jsonb_array_length(p_selected) NOT BETWEEN 1 AND 500 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_selected) selected WHERE jsonb_typeof(selected)<>'number' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) incoming_row WHERE incoming_row->'row'=selected)) OR (SELECT count(*)<>count(distinct value) FROM jsonb_array_elements(p_selected)) THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 hash:=encode(sha256(convert_to(jsonb_build_array(p_rows,p_selected,p_snapshot)::text,'UTF8')),'hex');
 SELECT * INTO receipt FROM himmah.contact_import_receipts WHERE organization_id=p_org AND actor_id=p_actor AND request_key=p_key;
 IF FOUND THEN
  IF receipt.payload_hash<>hash THEN RETURN jsonb_build_object('code','request_key_conflict'); END IF;
  RETURN receipt.result||jsonb_build_object('replayed',true);
 END IF;
 review:=himmah.contact_import_review(p_actor,p_org,p_rows);
 IF review->>'code' IS NOT NULL THEN RETURN review; END IF;
 IF review->>'snapshot' IS DISTINCT FROM p_snapshot THEN RETURN jsonb_build_object('code','version_conflict'); END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) WHERE p_selected @> jsonb_build_array(value->'row') LOOP
  INSERT INTO himmah.contacts(organization_id,display_name,given_name,family_name,created_by,updated_by)
  VALUES(p_org,r->>'displayName',r->>'givenName',r->>'familyName',p_actor,p_actor) RETURNING id INTO contact;
  INSERT INTO himmah.contact_custom_values(organization_id,contact_id,values) VALUES(p_org,contact,coalesce(r->'customValues','{}'::jsonb));
  FOR m IN SELECT value FROM jsonb_array_elements(r->'methods') LOOP
   INSERT INTO himmah.contact_methods(organization_id,contact_id,kind,value,normalized_value,preferred,created_by,updated_by)
   VALUES(p_org,contact,m->>'kind',m->>'value',m->>'normalizedValue',false,p_actor,p_actor);
  END LOOP;
  INSERT INTO himmah.people_audit_events(organization_id,actor_id,contact_id,action,entity_version,changed_fields)
  VALUES(p_org,p_actor,contact,'create',1,ARRAY['displayName','givenName','familyName','methods']);
  created:=created+1;
 END LOOP;
 outcome:=jsonb_build_object('created',created,'skipped',jsonb_array_length(p_rows)-created);
 INSERT INTO himmah.contact_import_receipts(organization_id,actor_id,request_key,payload_hash,result) VALUES(p_org,p_actor,p_key,hash,outcome);
 RETURN outcome;
END $$;
--> statement-breakpoint

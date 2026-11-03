-- Bounded, explicit new-contact imports. No file storage, overwrite, merge or inferred participation.
CREATE FUNCTION himmah.contact_import_rows_valid(p_rows jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN false WHEN jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 THEN false ELSE
 NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) r WHERE jsonb_typeof(r) IS DISTINCT FROM 'object'
 OR jsonb_typeof(r->'row') IS DISTINCT FROM 'number' OR (r->>'row') !~ '^[0-9]{1,6}$' OR (r->>'row')::numeric NOT BETWEEN 2 AND 100000
 OR jsonb_typeof(r->'displayName') IS DISTINCT FROM 'string' OR length(trim(r->>'displayName')) NOT BETWEEN 1 AND 120 OR (r->>'displayName') ~ '[[:cntrl:]]'
 OR (coalesce(jsonb_typeof(r->'givenName'),'null') NOT IN ('null','string')) OR (r->>'givenName' IS NOT NULL AND (length(trim(r->>'givenName')) NOT BETWEEN 1 AND 120 OR (r->>'givenName') ~ '[[:cntrl:]]'))
 OR (coalesce(jsonb_typeof(r->'familyName'),'null') NOT IN ('null','string')) OR (r->>'familyName' IS NOT NULL AND (length(trim(r->>'familyName')) NOT BETWEEN 1 AND 120 OR (r->>'familyName') ~ '[[:cntrl:]]'))
 OR CASE WHEN jsonb_typeof(r->'methods') IS DISTINCT FROM 'array' THEN true ELSE jsonb_array_length(r->'methods')>2 OR EXISTS(
 SELECT 1 FROM jsonb_array_elements(r->'methods') m WHERE jsonb_typeof(m) IS DISTINCT FROM 'object' OR m->>'kind' NOT IN ('email','phone') OR m->>'kind' IS NULL
 OR jsonb_typeof(m->'value') IS DISTINCT FROM 'string' OR length(m->>'value') NOT BETWEEN 1 AND 254 OR (m->>'value') ~ '[[:cntrl:]]'
 OR m->'preferred' IS DISTINCT FROM 'false'::jsonb OR jsonb_typeof(m->'normalizedValue') IS DISTINCT FROM 'string'
 OR CASE WHEN m->>'kind'='email' THEN m->>'normalizedValue' IS DISTINCT FROM lower(trim(m->>'value')) OR (m->>'normalizedValue') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 ELSE length(m->>'value')>64 OR (m->>'value') !~ '^[+][0-9 ()-]+$' OR m->>'normalizedValue' IS DISTINCT FROM regexp_replace(trim(m->>'value'),'[ ()-]','','g') OR (m->>'normalizedValue') !~ '^[+][1-9][0-9]{6,14}$' END)
 OR (SELECT count(*)<>count(distinct m->>'kind') FROM jsonb_array_elements(r->'methods') m) END)
 AND (SELECT count(*)=count(distinct r->>'row') FROM jsonb_array_elements(p_rows) r) END;
$$;
--> statement-breakpoint
CREATE FUNCTION himmah.contact_import_name(p_name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower(regexp_replace(trim(p_name),'[[:space:]]+',' ','g')); $$;
--> statement-breakpoint
CREATE FUNCTION himmah.contact_import_review(p_actor text,p_org uuid,p_rows jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE review jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM himmah.staff_memberships WHERE organization_id=p_org AND user_id=p_actor AND active AND role IN ('owner','admin')) THEN RETURN NULL; END IF;
 IF NOT himmah.contact_import_rows_valid(p_rows) THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
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
 SELECT jsonb_build_object('snapshot',md5(p_rows::text||coalesce(jsonb_agg(jsonb_build_array(n,candidates,file_matches) ORDER BY n),'[]'::jsonb)::text),
 'rows',coalesce(jsonb_agg(jsonb_build_object('row',n,'matchCount',(candidates->>'count')::int,'matches',candidates->'matches',
 'fileMatches',(SELECT coalesce(jsonb_agg(value),'[]'::jsonb) FROM (SELECT value FROM jsonb_array_elements(file_matches) LIMIT 5) bounded_file),'fileMatchCount',jsonb_array_length(file_matches)) ORDER BY n),'[]'::jsonb)) INTO review FROM reviewed;
 RETURN review;
END $$;
--> statement-breakpoint
CREATE FUNCTION himmah.contact_import(p_actor text,p_org uuid,p_key uuid,p_rows jsonb,p_selected jsonb,p_snapshot text) RETURNS jsonb LANGUAGE plpgsql AS $$
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
 IF review->>'snapshot' IS DISTINCT FROM p_snapshot THEN RETURN jsonb_build_object('code','version_conflict'); END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rows) WHERE p_selected @> jsonb_build_array(value->'row') LOOP
  INSERT INTO himmah.contacts(organization_id,display_name,given_name,family_name,created_by,updated_by)
  VALUES(p_org,r->>'displayName',r->>'givenName',r->>'familyName',p_actor,p_actor) RETURNING id INTO contact;
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
CREATE FUNCTION himmah.contact_import_receipt_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE check_violation USING MESSAGE='immutable_contact_import_receipt'; END $$;
--> statement-breakpoint
CREATE TRIGGER contact_import_receipt_immutable BEFORE UPDATE OR DELETE ON himmah.contact_import_receipts FOR EACH ROW EXECUTE FUNCTION himmah.contact_import_receipt_guard();

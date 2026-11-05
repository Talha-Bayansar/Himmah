CREATE FUNCTION hub_save_organization_settings(p_actor text,p_org uuid,p_key uuid,p_body jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,himmah AS $$
DECLARE previous hub_organization_settings%ROWTYPE; receipt hub_organization_settings_requests%ROWTYPE; outcome jsonb; current_version int; old_timezone text;
BEGIN
 -- Share the canonical organization lock with People commands and mirror updates.
 PERFORM 1 FROM himmah.organizations WHERE id=p_org FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_forbidden');END IF;
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin') FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found_or_forbidden'); END IF;
 SELECT * INTO receipt FROM hub_organization_settings_requests WHERE organization_id=p_org AND actor_id=p_actor AND request_key=p_key;
 IF FOUND THEN IF receipt.payload IS DISTINCT FROM p_body THEN RETURN jsonb_build_object('code','request_key_conflict');END IF;RETURN receipt.result||'{"replayed":true}'::jsonb;END IF;
 IF p_key IS NULL OR jsonb_typeof(p_body) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('code','invalid_input');END IF;
 IF jsonb_typeof(p_body->'name') IS DISTINCT FROM 'string' OR length(trim(p_body->>'name')) NOT BETWEEN 2 AND 100 OR (p_body->>'name') ~ '[[:cntrl:]]'
 OR jsonb_typeof(p_body->'description') IS DISTINCT FROM 'string' OR length(p_body->>'description')>1000
 OR jsonb_typeof(p_body->'email') IS DISTINCT FROM 'string' OR length(p_body->>'email')>254 OR (p_body->>'email') ~ '[[:cntrl:]]' OR (p_body->>'email'<>'' AND (p_body->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
 OR jsonb_typeof(p_body->'phone') IS DISTINCT FROM 'string' OR length(p_body->>'phone')>64 OR (p_body->>'phone'<>'' AND ((p_body->>'phone') !~ '^[+][1-9][0-9 ()-]+$' OR regexp_replace(p_body->>'phone','[ ()-]','','g') !~ '^[+][1-9][0-9]{6,14}$'))
 OR jsonb_typeof(p_body->'timezone') IS DISTINCT FROM 'string' OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_body->>'timezone')
 OR coalesce(p_body->>'defaultLanguage','') NOT IN ('en','nl','tr') OR jsonb_typeof(p_body->'quietEnabled') IS DISTINCT FROM 'boolean'
 OR jsonb_typeof(p_body->'quietStart') IS DISTINCT FROM 'number' OR jsonb_typeof(p_body->'quietEnd') IS DISTINCT FROM 'number'
 OR coalesce(p_body->>'quietStart','') !~ '^[0-9]{1,4}$' OR coalesce(p_body->>'quietEnd','') !~ '^[0-9]{1,4}$'
 OR jsonb_typeof(p_body->'version') IS DISTINCT FROM 'number' OR coalesce(p_body->>'version','') !~ '^[0-9]{1,10}$' THEN RETURN jsonb_build_object('code','invalid_input');END IF;
 IF (p_body->>'quietStart')::int NOT BETWEEN 0 AND 1439 OR (p_body->>'quietEnd')::int NOT BETWEEN 0 AND 1439 OR ((p_body->>'quietEnabled')::boolean AND p_body->>'quietStart'=p_body->>'quietEnd') THEN RETURN jsonb_build_object('code','invalid_input');END IF;
 SELECT * INTO previous FROM hub_organization_settings WHERE organization_id=p_org FOR UPDATE;
 current_version:=coalesce(previous.version,0);
 IF current_version IS DISTINCT FROM (p_body->>'version')::int THEN RETURN jsonb_build_object('code','version_conflict');END IF;
 SELECT timezone INTO old_timezone FROM hub_organizations WHERE id=p_org FOR UPDATE;
 UPDATE hub_organizations SET name=trim(p_body->>'name'),timezone=p_body->>'timezone' WHERE id=p_org;
 INSERT INTO hub_organization_settings(organization_id,description,email,phone,default_language,quiet_enabled,quiet_start,quiet_end,version,updated_by)
 VALUES(p_org,p_body->>'description',p_body->>'email',p_body->>'phone',p_body->>'defaultLanguage',(p_body->>'quietEnabled')::boolean,(p_body->>'quietStart')::int,(p_body->>'quietEnd')::int,current_version+1,p_actor)
 ON CONFLICT(organization_id) DO UPDATE SET description=excluded.description,email=excluded.email,phone=excluded.phone,default_language=excluded.default_language,quiet_enabled=excluded.quiet_enabled,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,version=excluded.version,updated_by=p_actor,updated_at=now();
 IF old_timezone IS DISTINCT FROM p_body->>'timezone' OR previous.organization_id IS NULL OR (previous.quiet_enabled,previous.quiet_start,previous.quiet_end) IS DISTINCT FROM ((p_body->>'quietEnabled')::boolean,(p_body->>'quietStart')::int,(p_body->>'quietEnd')::int) THEN
  -- Re-evaluate policy-only deferrals; never shorten a failed provider's backoff.
  UPDATE hub_push_deliveries d SET next_at=now() FROM hub_notifications n WHERE n.id=d.notification_id AND n.organization_id=p_org AND d.state='pending' AND d.attempts=0 AND d.next_at>now();
 END IF;
 INSERT INTO hub_directory_audit(organization_id,actor_id,action,entity_id) VALUES(p_org,p_actor,'organization.settings',p_org::text);
 outcome:=jsonb_build_object('id',p_org,'version',current_version+1,'replayed',false);
 INSERT INTO hub_organization_settings_requests(organization_id,actor_id,request_key,payload,result) VALUES(p_org,p_actor,p_key,p_body,outcome);
 RETURN outcome;
EXCEPTION WHEN invalid_text_representation OR check_violation OR not_null_violation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('code','invalid_input');
END $$;
--> statement-breakpoint
CREATE FUNCTION hub_settings_receipt_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE check_violation USING MESSAGE='immutable_organization_settings_receipt';END $$;
--> statement-breakpoint
CREATE TRIGGER hub_settings_receipt_immutable BEFORE UPDATE OR DELETE ON hub_organization_settings_requests FOR EACH ROW EXECUTE FUNCTION hub_settings_receipt_guard();

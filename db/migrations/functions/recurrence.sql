-- Bounded explicit planning; no cron expansion, attendance, registration or money side effects.
CREATE OR REPLACE FUNCTION hub_plan_sessions(p_actor text,p_org uuid,p_activity uuid,p_key uuid,p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE a hub_activities%ROWTYPE; anchor hub_activity_sessions%ROWTYPE; prior hub_session_operations%ROWTYPE;
 r jsonb; history jsonb:='[]'; ids jsonb:='[]'; response jsonb; sid uuid; series uuid:=gen_random_uuid(); pos int:=0; n int; expected int;
BEGIN
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin') FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('session-plan:'||p_org||':'||p_key,0));
 SELECT * INTO a FROM hub_activities WHERE organization_id=p_org AND id=p_activity FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 SELECT * INTO prior FROM hub_session_operations WHERE organization_id=p_org AND request_key=p_key;
 IF FOUND THEN
 IF prior.actor_id=p_actor AND prior.activity_id=p_activity AND prior.payload=p THEN RETURN prior.response-'scheduleHistory'; END IF;
 RETURN jsonb_build_object('code','conflict'); END IF;
 IF a.cancelled THEN RETURN jsonb_build_object('code','conflict'); END IF;
 IF jsonb_typeof(p->'occurrences') IS DISTINCT FROM 'array' OR coalesce(p->>'mode','') NOT IN ('create','edit') THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 n:=jsonb_array_length(p->'occurrences');
 IF n<1 OR n>52 THEN RETURN jsonb_build_object('code','series_limit'); END IF;
 IF EXISTS(select 1 from jsonb_array_elements(p->'occurrences') v where (v->>'startsAt')::timestamptz<=clock_timestamp() or (v->>'endsAt')::timestamptz<=(v->>'startsAt')::timestamptz or (v->>'endsAt')::timestamptz>(v->>'startsAt')::timestamptz+interval '7 days') THEN RETURN jsonb_build_object('code','session_future'); END IF;
 IF p->>'mode'='create' THEN
 IF (select count(distinct (v->>'startsAt')::timestamptz) from jsonb_array_elements(p->'occurrences') v)<>n OR (select max((v->>'startsAt')::timestamptz AT TIME ZONE a.timezone)-min((v->>'startsAt')::timestamptz AT TIME ZONE a.timezone) from jsonb_array_elements(p->'occurrences') v)>interval '366 days' THEN RETURN jsonb_build_object('code','series_limit'); END IF;
 IF n<2 OR a.version<>(p->>'version')::int OR a.timezone IS DISTINCT FROM p->>'timezone' THEN RETURN jsonb_build_object('code','conflict'); END IF;
 IF length(p->>'location')>160 OR (p->>'priceMinor')::int NOT BETWEEN 0 AND 100000000 THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 IF (select count(*) from himmah.activity_groups where organization_id=p_org and id=any(a.audience_group_ids) and not archived)<>cardinality(a.audience_group_ids) THEN RETURN jsonb_build_object('code','conflict'); END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p->'occurrences') LOOP
 INSERT INTO hub_activity_sessions(organization_id,activity_id,series_id,series_position,price_minor,name,description,topic,location,timezone,audience_group_ids,starts_at,ends_at,created_by,creation_key)
 VALUES(p_org,p_activity,series,pos,(p->>'priceMinor')::int,a.name,a.description,'',p->>'location',a.timezone,a.audience_group_ids,(r->>'startsAt')::timestamptz,(r->>'endsAt')::timestamptz,p_actor,gen_random_uuid()) RETURNING id INTO sid;
 ids:=ids||jsonb_build_array(sid); pos:=pos+1;
 INSERT INTO hub_directory_audit(organization_id,actor_id,action,entity_id)VALUES(p_org,p_actor,'session.series.create',sid::text);
 END LOOP;
 ELSE
 SELECT * INTO anchor FROM hub_activity_sessions WHERE organization_id=p_org AND activity_id=p_activity AND id=(p->>'anchor')::uuid;
 IF NOT FOUND OR anchor.cancelled OR anchor.starts_at<=clock_timestamp() OR coalesce(p->>'scope','') NOT IN ('one','future') THEN RETURN jsonb_build_object('code','conflict'); END IF;
 -- Deterministic complete-set locking: concurrent edits/cancellations/registrations must be reviewed again.
 PERFORM 1 FROM hub_activity_sessions s WHERE s.organization_id=p_org AND s.activity_id=p_activity AND (s.id=anchor.id OR (p->>'scope'='future' AND anchor.series_id IS NOT NULL AND s.series_id=anchor.series_id AND s.series_position>=anchor.series_position)) ORDER BY s.id FOR UPDATE;
 SELECT count(*) INTO expected FROM hub_activity_sessions s WHERE s.organization_id=p_org AND s.activity_id=p_activity AND NOT s.cancelled AND s.starts_at>clock_timestamp() AND (s.id=anchor.id OR (p->>'scope'='future' AND anchor.series_id IS NOT NULL AND s.series_id=anchor.series_id AND s.series_position>=anchor.series_position));
 IF expected<>n OR (SELECT count(distinct v->>'id') FROM jsonb_array_elements(p->'occurrences') v)<>n THEN RETURN jsonb_build_object('code','conflict'); END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'occurrences') v LEFT JOIN hub_activity_sessions s ON s.organization_id=p_org AND s.activity_id=p_activity AND s.id=(v->>'id')::uuid WHERE s.id IS NULL OR s.version<>(v->>'version')::int OR s.cancelled OR s.starts_at<=clock_timestamp() OR NOT (s.id=anchor.id OR (p->>'scope'='future' AND anchor.series_id IS NOT NULL AND s.series_id=anchor.series_id AND s.series_position>=anchor.series_position)) OR (EXISTS(select 1 from hub_session_registration_settings rs where rs.organization_id=p_org and rs.session_id=s.id and rs.mode='required') AND (s.starts_at<=clock_timestamp()+interval '30 minutes' OR (v->>'startsAt')::timestamptz<=clock_timestamp()+interval '30 minutes'))) THEN RETURN jsonb_build_object('code','conflict'); END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p->'occurrences') LOOP
 sid:=(r->>'id')::uuid;
 SELECT history||jsonb_build_array(jsonb_build_object('id',s.id,'before',jsonb_build_object('startsAt',s.starts_at,'endsAt',s.ends_at,'version',s.version),'after',r)) INTO history FROM hub_activity_sessions s WHERE organization_id=p_org AND activity_id=p_activity AND id=sid;
 UPDATE hub_activity_sessions SET starts_at=(r->>'startsAt')::timestamptz,ends_at=(r->>'endsAt')::timestamptz,version=version+1 WHERE organization_id=p_org AND activity_id=p_activity AND id=sid;
 ids:=ids||jsonb_build_array(sid);
 INSERT INTO hub_directory_audit(organization_id,actor_id,action,entity_id)VALUES(p_org,p_actor,'session.schedule.edit',sid::text);
 END LOOP;
 END IF;
 response:=jsonb_build_object('ids',ids,'count',n);
 INSERT INTO hub_session_operations(organization_id,request_key,activity_id,session_id,actor_id,payload,response)VALUES(p_org,p_key,p_activity,(ids->>0)::uuid,p_actor,p,response||jsonb_build_object('scheduleHistory',history));
 RETURN response;
END $$;

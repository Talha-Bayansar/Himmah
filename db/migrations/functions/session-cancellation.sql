-- Cancellation retains the ordinary session and all participation/financial history.
CREATE OR REPLACE FUNCTION hub_session_cancellation_preview(p_actor text,p_org uuid,p_activity uuid,p_anchor uuid,p_scope text) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE anchor hub_activity_sessions%ROWTYPE; ids uuid[]; items jsonb; digests jsonb:='{}'; t text; digest text; receipts uuid[];
BEGIN
 IF NOT hub_is_admin(p_actor,p_org) THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 IF p_scope IS NULL OR p_scope NOT IN ('one','future') THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 SELECT * INTO anchor FROM hub_activity_sessions WHERE organization_id=p_org AND activity_id=p_activity AND id=p_anchor;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 IF anchor.cancelled OR anchor.starts_at<=clock_timestamp() OR EXISTS(select 1 from hub_activities where organization_id=p_org and id=p_activity and cancelled) THEN RETURN jsonb_build_object('code','conflict'); END IF;
 SELECT array_agg(s.id ORDER BY s.series_position nulls first,s.id) INTO ids FROM hub_activity_sessions s
 WHERE s.organization_id=p_org AND s.activity_id=p_activity AND NOT s.cancelled AND s.starts_at>clock_timestamp()
 AND (s.id=anchor.id OR (p_scope='future' AND anchor.series_id IS NOT NULL AND s.series_id=anchor.series_id AND s.series_position>=anchor.series_position));
 IF coalesce(cardinality(ids),0)<1 OR NOT p_anchor=ANY(ids) OR cardinality(ids)>52 THEN RETURN jsonb_build_object('code','conflict'); END IF;
 SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO receipts FROM hub_cash_receipts WHERE organization_id=p_org AND session_id=ANY(ids);
 -- Hash the reviewed state, including new registrations, money and their corrections.
 FOREACH t IN ARRAY ARRAY['hub_activity_sessions','hub_session_registrations','hub_session_registration_settings','hub_attendance','hub_registration_charges','hub_cash_receipts'] LOOP
 EXECUTE format('select md5(coalesce(string_agg(to_jsonb(r)::text,'''' order by to_jsonb(r)::text),'''')) from public.%I r where r.organization_id=$1 and %s=ANY($2)',t,CASE WHEN t='hub_activity_sessions' THEN 'r.id' ELSE 'r.session_id' END) INTO digest USING p_org,ids;
 digests:=digests||jsonb_build_object(t,digest);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['hub_cash_allocations','hub_cash_allocation_corrections','hub_cash_reversals'] LOOP
 EXECUTE format('select md5(coalesce(string_agg(to_jsonb(r)::text,'''' order by to_jsonb(r)::text),'''')) from public.%I r where r.organization_id=$1 and r.receipt_id=ANY($2)',t) INTO digest USING p_org,receipts;
 digests:=digests||jsonb_build_object(t,digest);
 END LOOP;
 SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'topic',s.topic,'startsAt',s.starts_at,'endsAt',s.ends_at,'timezone',s.timezone,
 'registrations',(select count(*) from hub_session_registrations r where r.organization_id=p_org and r.session_id=s.id and r.status='confirmed'),
 'attendance',(select count(*) from hub_attendance r where r.organization_id=p_org and r.session_id=s.id),
 'charges',(select count(*) from hub_registration_charges r where r.organization_id=p_org and r.session_id=s.id),
 'collectedMinor',(select coalesce(sum(r.amount_minor-hub_cash_receipt_corrected(p_org,r.id)),0) from hub_cash_receipts r where r.organization_id=p_org and r.session_id=s.id and not exists(select 1 from hub_cash_reversals rev where rev.organization_id=p_org and rev.receipt_id=r.id))) ORDER BY s.starts_at,s.id)
 INTO items FROM hub_activity_sessions s WHERE s.organization_id=p_org AND s.id=ANY(ids);
 RETURN jsonb_build_object('snapshot',md5(jsonb_build_object('org',p_org,'activity',p_activity,'anchor',p_anchor,'scope',p_scope,'digests',digests)::text),
 'seriesId',anchor.series_id,'items',items);
END $$;

CREATE OR REPLACE FUNCTION hub_cancel_sessions(p_actor text,p_org uuid,p_activity uuid,p_key uuid,p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE prior hub_session_operations%ROWTYPE; anchor hub_activity_sessions%ROWTYPE; preview jsonb; r jsonb; history jsonb:='[]'; response jsonb; ids uuid[];
BEGIN
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin') FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 IF p->>'mode' IS DISTINCT FROM 'cancel' OR coalesce(p->>'scope','') NOT IN ('one','future') OR coalesce(p->>'snapshot','') !~ '^[a-f0-9]{32}$' OR jsonb_typeof(p->'reason') IS DISTINCT FROM 'string' OR length(trim(p->>'reason')) NOT BETWEEN 1 AND 300 THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('session-cancel:'||p_org||':'||p_key,0));
 PERFORM 1 FROM hub_activities WHERE organization_id=p_org AND id=p_activity FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 SELECT * INTO prior FROM hub_session_operations WHERE organization_id=p_org AND request_key=p_key;
 IF FOUND THEN
 IF prior.actor_id=p_actor AND prior.activity_id=p_activity AND prior.payload=p THEN RETURN prior.response-'cancellationHistory'; END IF;
 RETURN jsonb_build_object('code','conflict'); END IF;
 SELECT * INTO anchor FROM hub_activity_sessions WHERE organization_id=p_org AND activity_id=p_activity AND id=(p->>'anchor')::uuid;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 PERFORM 1 FROM hub_activity_sessions s WHERE s.organization_id=p_org AND s.activity_id=p_activity AND (s.id=anchor.id OR (p->>'scope'='future' AND anchor.series_id IS NOT NULL AND s.series_id=anchor.series_id AND s.series_position>=anchor.series_position)) ORDER BY s.id FOR UPDATE;
 preview:=hub_session_cancellation_preview(p_actor,p_org,p_activity,anchor.id,p->>'scope');
 IF preview ? 'code' THEN RETURN preview; END IF;
 IF preview->>'snapshot' IS DISTINCT FROM p->>'snapshot' THEN RETURN jsonb_build_object('code','conflict'); END IF;
 SELECT array_agg((v->>'id')::uuid ORDER BY v->>'id') INTO ids FROM jsonb_array_elements(preview->'items') v;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'version',s.version,'cancelled',s.cancelled,'reason',s.cancellation_reason) ORDER BY s.id),'[]') INTO history FROM hub_activity_sessions s WHERE s.organization_id=p_org AND s.id=ANY(ids);
 UPDATE hub_activity_sessions SET cancelled=true,cancellation_reason=trim(p->>'reason'),version=version+1 WHERE organization_id=p_org AND activity_id=p_activity AND id=ANY(ids);
 INSERT INTO hub_directory_audit(organization_id,actor_id,action,entity_id) SELECT p_org,p_actor,'session.cancel',id::text FROM unnest(ids) id;
 response:=jsonb_build_object('ids',to_jsonb(ids),'count',cardinality(ids),'reviewRequired',EXISTS(select 1 from jsonb_array_elements(preview->'items') v where (v->>'charges')::bigint>0 or (v->>'collectedMinor')::bigint>0));
 INSERT INTO hub_session_operations(organization_id,activity_id,session_id,request_key,actor_id,payload,response)VALUES(p_org,p_activity,anchor.id,p_key,p_actor,p,response||jsonb_build_object('cancellationHistory',history));
 RETURN response;
END $$;

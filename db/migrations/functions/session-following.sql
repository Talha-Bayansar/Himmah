-- Explicit personal opt-in. Session rows, including disabled rows, override activity defaults.
CREATE FUNCTION hub_effective_session_follows(p_org uuid,p_activity uuid,p_session uuid)
RETURNS SETOF hub_session_follows LANGUAGE sql STABLE AS $$
 SELECT f.* FROM hub_session_follows f
 WHERE f.organization_id=p_org AND f.activity_id=p_activity AND f.enabled
 AND (f.session_id=p_session OR (f.session_id IS NULL AND NOT EXISTS(
  SELECT 1 FROM hub_session_follows own WHERE own.organization_id=p_org AND own.user_id=f.user_id AND own.activity_id=p_activity AND own.session_id=p_session)))
 AND EXISTS(SELECT 1 FROM hub_memberships m WHERE m.organization_id=p_org AND m.user_id=f.user_id)
 AND hub_can_view_session(f.user_id,p_org,p_activity,p_session);
$$;
--> statement-breakpoint
CREATE FUNCTION hub_session_notice_fingerprint(s hub_activity_sessions) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT md5(jsonb_build_array(extract(epoch from s.starts_at),extract(epoch from s.ends_at),s.timezone,s.name,s.topic,s.location,s.cancelled)::text);
$$;
--> statement-breakpoint
CREATE FUNCTION hub_session_notice_href(p_user text,p_org uuid,p_activity uuid,p_session uuid) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT '/workspace/'||p_org||'/activities/'||p_activity||'/sessions/'||p_session||
 CASE WHEN hub_can_attend_session(p_user,p_org,p_activity,p_session) OR hub_can_collect_session(p_user,p_org,p_activity,p_session) THEN '/attendance' ELSE '' END;
$$;
--> statement-breakpoint
CREATE FUNCTION hub_follow_state(p_user text,p_org uuid,p_activity uuid,p_session uuid) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE a hub_activities%ROWTYPE; s hub_activity_sessions%ROWTYPE; own hub_session_follows%ROWTYPE; effective hub_session_follows%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_user) THEN RETURN NULL; END IF;
 SELECT * INTO a FROM hub_activities WHERE organization_id=p_org AND id=p_activity;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF p_session IS NULL THEN
  IF NOT hub_can_view_activity(p_user,p_org,p_activity) THEN RETURN NULL; END IF;
 ELSE
  SELECT * INTO s FROM hub_activity_sessions WHERE organization_id=p_org AND activity_id=p_activity AND id=p_session;
  IF NOT FOUND OR NOT hub_can_view_session(p_user,p_org,p_activity,p_session) THEN RETURN NULL; END IF;
 END IF;
 SELECT * INTO own FROM hub_session_follows WHERE organization_id=p_org AND user_id=p_user AND activity_id=p_activity AND session_id IS NOT DISTINCT FROM p_session;
 effective:=own;
 IF own.id IS NULL AND p_session IS NOT NULL THEN
  SELECT * INTO effective FROM hub_session_follows WHERE organization_id=p_org AND user_id=p_user AND activity_id=p_activity AND session_id IS NULL;
 END IF;
 RETURN jsonb_build_object('following',coalesce(effective.enabled,false),'reminderMinutes',coalesce(effective.reminder_minutes,60),'version',coalesce(own.version,0),
 'source',CASE WHEN own.id IS NOT NULL THEN 'own' WHEN effective.enabled THEN 'activity' ELSE 'none' END,
 'canFollow',NOT a.cancelled AND (p_session IS NULL OR (NOT s.cancelled AND s.starts_at>now())));
END $$;
--> statement-breakpoint
CREATE FUNCTION hub_set_follow(p_user text,p_org uuid,p_activity uuid,p_session uuid,p_key uuid,p_body jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE current_state jsonb; payload jsonb; receipt hub_follow_requests%ROWTYPE; own hub_session_follows%ROWTYPE; outcome jsonb;
BEGIN
 -- Current authorization precedes command receipt replay.
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_user FOR UPDATE;
 current_state:=hub_follow_state(p_user,p_org,p_activity,p_session);
 IF current_state IS NULL THEN RETURN jsonb_build_object('code','not_found'); END IF;
 IF jsonb_typeof(p_body->'following') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_body->'reminderMinutes') IS DISTINCT FROM 'number'
 OR p_body->>'reminderMinutes' NOT IN ('0','60') OR jsonb_typeof(p_body->'version') IS DISTINCT FROM 'number'
 OR (p_body->>'version') !~ '^[0-9]+$' OR (p_body->>'version')::numeric>2147483646 THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 payload:=jsonb_build_object('activity',p_activity,'session',p_session,'following',p_body->'following','reminderMinutes',p_body->'reminderMinutes','version',p_body->'version');
 SELECT * INTO receipt FROM hub_follow_requests WHERE organization_id=p_org AND user_id=p_user AND request_key=p_key;
 IF FOUND THEN
  IF receipt.payload IS DISTINCT FROM payload THEN RETURN jsonb_build_object('code','request_key_conflict'); END IF;
  RETURN receipt.result;
 END IF;
 IF current_state->>'version' IS DISTINCT FROM p_body->>'version' THEN RETURN jsonb_build_object('code','version_conflict'); END IF;
 IF (p_body->>'following')::boolean AND NOT (current_state->>'canFollow')::boolean THEN RETURN jsonb_build_object('code','follow_closed'); END IF;
 SELECT * INTO own FROM hub_session_follows WHERE organization_id=p_org AND user_id=p_user AND activity_id=p_activity AND session_id IS NOT DISTINCT FROM p_session FOR UPDATE;
 IF own.id IS NULL THEN
  INSERT INTO hub_session_follows(organization_id,user_id,activity_id,session_id,enabled,reminder_minutes)
  VALUES(p_org,p_user,p_activity,p_session,(p_body->>'following')::boolean,(p_body->>'reminderMinutes')::int);
 ELSE
  UPDATE hub_session_follows SET enabled=(p_body->>'following')::boolean,reminder_minutes=(p_body->>'reminderMinutes')::int,version=version+1,updated_at=clock_timestamp() WHERE id=own.id;
 END IF;
 outcome:=hub_follow_state(p_user,p_org,p_activity,p_session);
 INSERT INTO hub_follow_requests(organization_id,user_id,request_key,activity_id,session_id,payload,result) VALUES(p_org,p_user,p_key,p_activity,p_session,payload,outcome);
 INSERT INTO hub_directory_audit(organization_id,actor_id,action,entity_id) VALUES(p_org,p_user,CASE WHEN p_session IS NULL THEN 'activity.follow' ELSE 'session.follow' END,coalesce(p_session,p_activity)::text);
 RETURN outcome;
END $$;
--> statement-breakpoint
CREATE FUNCTION hub_session_follow_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind text; event uuid:=gen_random_uuid();
BEGIN
 IF hub_session_notice_fingerprint(OLD)=hub_session_notice_fingerprint(NEW) OR (OLD.starts_at<=now() AND NEW.starts_at<=now()) THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM hub_activities WHERE organization_id=NEW.organization_id AND id=NEW.activity_id AND NOT cancelled) THEN RETURN NEW; END IF;
 IF NEW.cancelled AND NOT OLD.cancelled THEN kind:='session_cancelled';
 ELSIF NOT NEW.cancelled THEN kind:='session_changed'; ELSE RETURN NEW; END IF;
 INSERT INTO hub_notifications(organization_id,user_id,event_id,kind,href,activity_id,session_id,follow_id,follow_version,planned_at,session_fingerprint)
 SELECT NEW.organization_id,f.user_id,event,kind,hub_session_notice_href(f.user_id,NEW.organization_id,NEW.activity_id,NEW.id),NEW.activity_id,NEW.id,f.id,f.version,NEW.starts_at,hub_session_notice_fingerprint(NEW)
 FROM hub_effective_session_follows(NEW.organization_id,NEW.activity_id,NEW.id) f ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER hub_session_follow_events AFTER UPDATE ON hub_activity_sessions FOR EACH ROW EXECUTE FUNCTION hub_session_follow_event();
--> statement-breakpoint
CREATE FUNCTION hub_generate_session_reminders() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE produced integer;
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtext('himmah-session-reminders')) THEN RETURN 0; END IF;
 INSERT INTO hub_notifications(organization_id,user_id,event_id,kind,href,activity_id,session_id,follow_id,follow_version,planned_at,session_fingerprint)
 SELECT s.organization_id,f.user_id,gen_random_uuid(),'session_reminder',hub_session_notice_href(f.user_id,s.organization_id,s.activity_id,s.id),s.activity_id,s.id,f.id,f.version,s.starts_at,hub_session_notice_fingerprint(s)
 FROM hub_activity_sessions s JOIN hub_activities a ON a.organization_id=s.organization_id AND a.id=s.activity_id
 CROSS JOIN LATERAL hub_effective_session_follows(s.organization_id,s.activity_id,s.id) f
 WHERE NOT s.cancelled AND NOT a.cancelled AND s.starts_at>now() AND s.starts_at<=now()+interval '1 hour' AND f.reminder_minutes=60
 AND NOT EXISTS(SELECT 1 FROM hub_notifications n WHERE n.organization_id=s.organization_id AND n.user_id=f.user_id AND n.session_id=s.id AND n.planned_at=s.starts_at AND n.kind='session_reminder')
 ORDER BY s.starts_at,s.id,f.id LIMIT 100 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS produced=ROW_COUNT;
 RETURN produced;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION hub_notification_visible(n hub_notifications,p_user text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT n.user_id=p_user AND EXISTS(SELECT 1 FROM hub_memberships WHERE organization_id=n.organization_id AND user_id=p_user)
 AND (n.kind='staff_notice' OR (n.kind IN ('session_reminder','session_changed','session_cancelled') AND EXISTS(
 SELECT 1 FROM hub_activity_sessions s JOIN hub_activities a ON a.organization_id=s.organization_id AND a.id=s.activity_id
 JOIN hub_effective_session_follows(n.organization_id,n.activity_id,n.session_id) f ON f.id=n.follow_id AND f.user_id=p_user AND f.version=n.follow_version
 WHERE s.organization_id=n.organization_id AND s.activity_id=n.activity_id AND s.id=n.session_id AND NOT a.cancelled
 AND n.session_fingerprint=hub_session_notice_fingerprint(s)
 AND (n.kind<>'session_reminder' OR (NOT s.cancelled AND s.starts_at=n.planned_at AND s.starts_at>now())))));
$$;

-- Materialize the original roster before the first operation after check-in opens.
-- All commands take the same organization/session locks, so no post-cutoff change can precede this snapshot.
CREATE OR REPLACE FUNCTION hub_registration_freeze(p_actor text,p_org uuid,p_activity uuid,p_session uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE s hub_activity_sessions%ROWTYPE; policy hub_session_registration_settings%ROWTYPE;
BEGIN
 SELECT * INTO s FROM hub_activity_sessions WHERE organization_id=p_org AND activity_id=p_activity AND id=p_session FOR UPDATE;
 SELECT * INTO policy FROM hub_session_registration_settings WHERE organization_id=p_org AND session_id=p_session FOR UPDATE;
 IF policy.mode='required' AND policy.frozen_at IS NULL AND clock_timestamp()>=s.starts_at-interval '30 minutes' THEN
  INSERT INTO hub_session_expected_contacts(organization_id,activity_id,session_id,person_id,initial,included,created_at)
  SELECT p_org,p_activity,p_session,person_id,true,true,s.starts_at-interval '30 minutes' FROM hub_session_registrations WHERE organization_id=p_org AND session_id=p_session AND status='confirmed';
  UPDATE hub_session_registration_settings SET frozen_at=s.starts_at-interval '30 minutes' WHERE organization_id=p_org AND session_id=p_session;
  INSERT INTO hub_session_registration_events(organization_id,activity_id,session_id,actor_id,action,after) VALUES(p_org,p_activity,p_session,p_actor,'freeze',jsonb_build_object('frozenAt',s.starts_at-interval '30 minutes'));
 END IF;
END; $$;

CREATE OR REPLACE FUNCTION hub_registration_summary(p_actor text,p_org uuid,p_activity uuid,p_session uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE s hub_activity_sessions%ROWTYPE; policy hub_session_registration_settings%ROWTYPE; admin boolean; confirmed integer; all_confirmed integer; expected integer; original integer;
BEGIN
 PERFORM 1 FROM himmah.organizations WHERE id=p_org FOR NO KEY UPDATE;
 PERFORM 1 FROM hub_organizations WHERE id=p_org FOR NO KEY UPDATE;
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 PERFORM hub_lock_access(p_actor,p_org);
 IF NOT hub_can_attend_session(p_actor,p_org,p_activity,p_session) THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 SELECT * INTO s FROM hub_activity_sessions WHERE organization_id=p_org AND activity_id=p_activity AND id=p_session FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 PERFORM hub_registration_freeze(p_actor,p_org,p_activity,p_session);
 SELECT * INTO policy FROM hub_session_registration_settings WHERE organization_id=p_org AND session_id=p_session;
 admin:=hub_is_admin(p_actor,p_org);
 SELECT count(*)::int,count(*) filter(where hub_can_attend_person(p_actor,p_org,p_activity,p_session,person_id))::int INTO all_confirmed,confirmed FROM hub_session_registrations WHERE organization_id=p_org AND session_id=p_session AND status='confirmed';
 IF policy.mode='required' THEN
  IF policy.frozen_at IS NULL THEN expected:=confirmed; original:=confirmed;
  ELSE
   SELECT count(*) filter(where included)::int,count(*) filter(where initial)::int INTO expected,original FROM hub_session_expected_contacts WHERE organization_id=p_org AND session_id=p_session AND hub_can_attend_person(p_actor,p_org,p_activity,p_session,person_id);
  END IF;
 END IF;
 RETURN jsonb_build_object('priceMinor',s.price_minor,'sessionVersion',s.version,'chargeCount',CASE WHEN admin THEN (SELECT count(*)::int FROM hub_registration_charges ch JOIN hub_session_registrations cr ON cr.organization_id=ch.organization_id AND cr.id=ch.registration_id WHERE cr.organization_id=p_org AND cr.session_id=p_session) ELSE NULL END,'chargeReviewCount',CASE WHEN admin THEN (SELECT count(*)::int FROM hub_registration_charges ch JOIN hub_session_registrations cr ON cr.organization_id=ch.organization_id AND cr.id=ch.registration_id WHERE cr.organization_id=p_org AND cr.session_id=p_session AND (cr.status='cancelled' OR s.cancelled OR EXISTS(SELECT 1 FROM hub_activities WHERE organization_id=p_org AND id=p_activity AND cancelled))) ELSE NULL END,'mode',coalesce(policy.mode,'open'),'capacity',policy.capacity,'version',coalesce(policy.version,0),'confirmed',confirmed,'remaining',CASE WHEN policy.capacity IS NULL THEN NULL ELSE greatest(0,policy.capacity-all_confirmed) END,'expected',expected,'originalExpected',original,'frozenAt',policy.frozen_at,'checkInOpensAt',s.starts_at-interval '30 minutes','canManage',admin,'canConfigure',admin AND NOT s.cancelled AND NOT EXISTS(SELECT 1 FROM hub_activities WHERE organization_id=p_org AND id=p_activity AND cancelled) AND s.starts_at-interval '30 minutes'>clock_timestamp(),'canRegister',NOT s.cancelled AND s.ends_at>clock_timestamp() AND (admin OR s.starts_at-interval '30 minutes'<=clock_timestamp()) AND NOT EXISTS(SELECT 1 FROM hub_activities WHERE organization_id=p_org AND id=p_activity AND cancelled),'cancelled',s.cancelled);
END; $$;

CREATE OR REPLACE FUNCTION hub_registration_command(p_actor text,p_org uuid,p_activity uuid,p_session uuid,p_key uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE s hub_activity_sessions%ROWTYPE; policy hub_session_registration_settings%ROWTYPE; r hub_session_registrations%ROWTYPE; old_r hub_session_registrations%ROWTYPE; receipt hub_session_registration_requests%ROWTYPE;
 action text:=p_payload->>'action'; person uuid; reason text:=coalesce(p_payload->>'reason',''); admin boolean; parent_cancelled boolean; result jsonb; before_value jsonb; after_value jsonb; contact_version integer; old_included boolean;
BEGIN
 PERFORM 1 FROM himmah.organizations WHERE id=p_org FOR NO KEY UPDATE;
 PERFORM 1 FROM hub_organizations WHERE id=p_org FOR NO KEY UPDATE;
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 SELECT cancelled INTO parent_cancelled FROM hub_activities WHERE organization_id=p_org AND id=p_activity FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 SELECT * INTO s FROM hub_activity_sessions WHERE organization_id=p_org AND activity_id=p_activity AND id=p_session FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 admin:=hub_is_admin(p_actor,p_org);
 person:=(p_payload->>'personId')::uuid;
 IF action IS NULL OR action NOT IN ('configure','register','cancel') OR length(reason)>300 OR p_key IS NULL THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 IF action<>'configure' AND person IS NULL THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 PERFORM 1 FROM himmah.activity_contacts WHERE organization_id=p_org AND id=person FOR UPDATE;
 PERFORM hub_lock_access(p_actor,p_org);
 IF NOT hub_can_attend_session(p_actor,p_org,p_activity,p_session) OR (NOT admin AND (action<>'register' OR NOT hub_can_attend_person(p_actor,p_org,p_activity,p_session,person))) THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 SELECT * INTO receipt FROM hub_session_registration_requests WHERE organization_id=p_org AND session_id=p_session AND request_key=p_key;
 IF FOUND THEN
  IF receipt.actor_id<>p_actor OR receipt.payload<>p_payload THEN RETURN jsonb_build_object('code','registration_key'); END IF;
  RETURN receipt.response;
 END IF;
 IF s.cancelled OR parent_cancelled OR s.ends_at<=clock_timestamp() THEN RETURN jsonb_build_object('code','registration_closed'); END IF;
 IF NOT admin AND s.starts_at-interval '30 minutes'>clock_timestamp() THEN RETURN jsonb_build_object('code','registration_closed'); END IF;
 PERFORM hub_registration_freeze(p_actor,p_org,p_activity,p_session);
 SELECT * INTO policy FROM hub_session_registration_settings WHERE organization_id=p_org AND session_id=p_session FOR UPDATE;
 IF action='register' AND s.price_minor>0 AND (p_payload->>'sessionVersion')::int IS DISTINCT FROM s.version THEN RETURN jsonb_build_object('code','conflict'); END IF;
 IF action='configure' THEN
  IF s.starts_at-interval '30 minutes'<=clock_timestamp() THEN RETURN jsonb_build_object('code','registration_locked'); END IF;
  IF coalesce(policy.version,0) IS DISTINCT FROM (p_payload->>'version')::int THEN RETURN jsonb_build_object('code','conflict'); END IF;
  IF p_payload->>'mode' IS NULL OR p_payload->>'mode' NOT IN ('open','required') OR (p_payload->>'capacity' IS NOT NULL AND (p_payload->>'capacity')::int NOT BETWEEN 1 AND 100000) THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
  IF (p_payload->>'capacity')::int < (SELECT count(*) FROM hub_session_registrations WHERE organization_id=p_org AND session_id=p_session AND status='confirmed') THEN RETURN jsonb_build_object('code','registration_capacity'); END IF;
  before_value:=CASE WHEN policy.session_id IS NOT NULL THEN to_jsonb(policy) ELSE NULL END;
  INSERT INTO hub_session_registration_settings(organization_id,activity_id,session_id,mode,capacity) VALUES(p_org,p_activity,p_session,p_payload->>'mode',(p_payload->>'capacity')::int)
  ON CONFLICT(organization_id,session_id) DO UPDATE SET mode=excluded.mode,capacity=excluded.capacity,version=hub_session_registration_settings.version+1 RETURNING * INTO policy;
  after_value:=to_jsonb(policy); result:=jsonb_build_object('version',policy.version);
 ELSE
  SELECT * INTO old_r FROM hub_session_registrations WHERE organization_id=p_org AND session_id=p_session AND person_id=person FOR UPDATE;
  IF coalesce(old_r.version,0) IS DISTINCT FROM (p_payload->>'version')::int THEN RETURN jsonb_build_object('code','conflict'); END IF;
  SELECT included INTO old_included FROM hub_session_expected_contacts WHERE organization_id=p_org AND session_id=p_session AND person_id=person;
  before_value:=jsonb_build_object('registration',CASE WHEN old_r.id IS NULL THEN NULL ELSE to_jsonb(old_r) END,'expected',old_included);
  IF action='register' THEN
   SELECT version INTO contact_version FROM himmah.activity_contacts c WHERE organization_id=p_org AND id=person AND NOT archived AND (cardinality(s.audience_group_ids)=0 OR EXISTS(SELECT 1 FROM himmah.activity_memberships gm WHERE gm.organization_id=p_org AND gm.person_id=c.id AND gm.group_id=ANY(s.audience_group_ids)));
   IF NOT FOUND THEN RETURN jsonb_build_object('code','registration_ineligible'); END IF;
   IF contact_version IS DISTINCT FROM (p_payload->>'contactVersion')::int THEN RETURN jsonb_build_object('code','conflict'); END IF;
   IF old_r.status='confirmed' THEN RETURN jsonb_build_object('code','registration_duplicate'); END IF;
   IF policy.capacity IS NOT NULL AND (SELECT count(*) FROM hub_session_registrations WHERE organization_id=p_org AND session_id=p_session AND status='confirmed')>=policy.capacity THEN RETURN jsonb_build_object('code','registration_capacity'); END IF;
   IF policy.frozen_at IS NOT NULL AND length(trim(reason))=0 THEN RETURN jsonb_build_object('code','registration_reason'); END IF;
   INSERT INTO hub_session_registrations(organization_id,activity_id,session_id,person_id,status,source) VALUES(p_org,p_activity,p_session,person,'confirmed',CASE WHEN clock_timestamp()>=s.starts_at THEN 'walk_in' ELSE 'advance' END)
   ON CONFLICT(organization_id,session_id,person_id) DO UPDATE SET status='confirmed',source=excluded.source,version=hub_session_registrations.version+1,updated_at=clock_timestamp() RETURNING * INTO r;
   IF s.price_minor>0 THEN
    INSERT INTO hub_registration_charges(organization_id,registration_id,amount_minor,created_by) VALUES(p_org,r.id,s.price_minor,p_actor) ON CONFLICT(organization_id,registration_id) DO NOTHING;
   END IF;
   IF policy.frozen_at IS NOT NULL THEN
    INSERT INTO hub_session_expected_contacts(organization_id,activity_id,session_id,person_id,initial,included) VALUES(p_org,p_activity,p_session,person,false,true)
    ON CONFLICT(organization_id,session_id,person_id) DO UPDATE SET included=true;
   END IF;
  ELSE
   IF old_r.status IS DISTINCT FROM 'confirmed' THEN RETURN jsonb_build_object('code','conflict'); END IF;
   IF length(trim(reason))=0 THEN RETURN jsonb_build_object('code','registration_reason'); END IF;
   UPDATE hub_session_registrations SET status='cancelled',version=version+1,updated_at=clock_timestamp() WHERE id=old_r.id RETURNING * INTO r;
   IF policy.frozen_at IS NOT NULL THEN UPDATE hub_session_expected_contacts SET included=false WHERE organization_id=p_org AND session_id=p_session AND person_id=person; END IF;
  END IF;
  after_value:=jsonb_build_object('registration',to_jsonb(r),'expected',CASE WHEN policy.mode='required' THEN r.status='confirmed' ELSE NULL END,'charge',(SELECT jsonb_build_object('id',id,'amountMinor',amount_minor,'currency',currency) FROM hub_registration_charges WHERE organization_id=p_org AND registration_id=r.id));
  result:=jsonb_build_object('id',r.id,'version',r.version);
 END IF;
 INSERT INTO hub_session_registration_events(organization_id,activity_id,session_id,person_id,actor_id,action,reason,before,after) VALUES(p_org,p_activity,p_session,person,p_actor,action,trim(reason),before_value,after_value);
 INSERT INTO hub_directory_audit(organization_id,actor_id,action,entity_id) VALUES(p_org,p_actor,'registration.'||action,p_session::text);
 INSERT INTO hub_session_registration_requests(organization_id,activity_id,session_id,request_key,actor_id,payload,response) VALUES(p_org,p_activity,p_session,p_key,p_actor,p_payload,result);
 RETURN result;
EXCEPTION WHEN check_violation OR not_null_violation OR invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('code','invalid_input');
END; $$;

CREATE OR REPLACE FUNCTION hub_registration_schedule_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.starts_at<>OLD.starts_at OR NEW.ends_at<>OLD.ends_at) AND EXISTS(SELECT 1 FROM hub_session_registration_settings WHERE organization_id=OLD.organization_id AND session_id=OLD.id AND mode='required') AND (OLD.starts_at<=clock_timestamp()+interval '30 minutes' OR NEW.starts_at<=clock_timestamp()+interval '30 minutes') THEN RAISE check_violation USING MESSAGE='Registered session check-in roster is frozen'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER hub_registration_schedule_guard BEFORE UPDATE OF starts_at,ends_at ON hub_activity_sessions FOR EACH ROW EXECUTE FUNCTION hub_registration_schedule_guard();
CREATE TRIGGER hub_registration_events_immutable BEFORE UPDATE OR DELETE ON hub_session_registration_events FOR EACH ROW EXECUTE FUNCTION hub_history_immutable();
CREATE TRIGGER hub_registration_requests_immutable BEFORE UPDATE OR DELETE ON hub_session_registration_requests FOR EACH ROW EXECUTE FUNCTION hub_history_immutable();

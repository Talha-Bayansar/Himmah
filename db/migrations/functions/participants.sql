CREATE FUNCTION hub_participant_person(p_actor text,p_org uuid) RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT l.person_id FROM hub_participant_links l JOIN hub_people p ON p.organization_id=l.organization_id AND p.id=l.person_id WHERE l.organization_id=p_org AND l.user_id=p_actor AND l.revoked_at IS NULL AND NOT p.archived LIMIT 1;
$$;
--> statement-breakpoint
CREATE FUNCTION hub_participant_role_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM hub_organizations WHERE id=NEW.organization_id FOR NO KEY UPDATE;
 IF TG_TABLE_NAME='hub_memberships' THEN
  IF EXISTS(SELECT 1 FROM hub_participant_links WHERE organization_id=NEW.organization_id AND user_id=NEW.user_id AND revoked_at IS NULL) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='participant_staff_conflict'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM hub_memberships WHERE organization_id=NEW.organization_id AND user_id=NEW.user_id) THEN RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='participant_staff_conflict'; END IF;
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER hub_participant_staff_guard BEFORE INSERT ON hub_memberships FOR EACH ROW EXECUTE FUNCTION hub_participant_role_guard();
--> statement-breakpoint
CREATE TRIGGER hub_participant_link_guard BEFORE INSERT ON hub_participant_links FOR EACH ROW EXECUTE FUNCTION hub_participant_role_guard();
--> statement-breakpoint
CREATE FUNCTION hub_invite_participant(p_actor text,p_org uuid,p_person uuid,p_key uuid,p_email text,p_hash text,p_consent boolean) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_old hub_participant_invitations%ROWTYPE;v_new hub_participant_invitations%ROWTYPE;
BEGIN
 PERFORM 1 FROM hub_organizations WHERE id=p_org FOR NO KEY UPDATE;
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin') FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 IF p_consent IS DISTINCT FROM true THEN RETURN jsonb_build_object('code','participant_consent'); END IF;
 SELECT * INTO v_old FROM hub_participant_invitations WHERE organization_id=p_org AND creation_key=p_key;
 IF FOUND THEN
  IF v_old.created_by<>p_actor OR v_old.person_id<>p_person OR v_old.email<>p_email OR v_old.token_hash<>p_hash THEN RETURN jsonb_build_object('code','conflict'); END IF;
  RETURN jsonb_build_object('id',v_old.id);
 END IF;
 PERFORM 1 FROM hub_people WHERE organization_id=p_org AND id=p_person AND NOT archived FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 IF EXISTS(SELECT 1 FROM hub_participant_links WHERE organization_id=p_org AND person_id=p_person AND revoked_at IS NULL) THEN RETURN jsonb_build_object('code','participant_linked'); END IF;
 IF EXISTS(SELECT 1 FROM hub_participant_invitations WHERE organization_id=p_org AND person_id=p_person AND revoked_at IS NULL AND accepted_by IS NULL AND expires_at>clock_timestamp()) THEN RETURN jsonb_build_object('code','participant_pending'); END IF;
 INSERT INTO hub_participant_invitations(organization_id,person_id,email,created_by,creation_key,token_hash,expires_at) VALUES(p_org,p_person,p_email,p_actor,p_key,p_hash,now()+interval '7 days') RETURNING * INTO v_new;
 INSERT INTO hub_participant_events(organization_id,person_id,actor_id,action,entity_id) VALUES(p_org,p_person,p_actor,'invite',v_new.id);
 RETURN jsonb_build_object('id',v_new.id);
END; $$;
--> statement-breakpoint
CREATE FUNCTION hub_accept_participant(p_actor text,p_email text,p_hash text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_inv hub_participant_invitations%ROWTYPE;v_org uuid;v_link hub_participant_links%ROWTYPE;
BEGIN
 SELECT organization_id INTO v_org FROM hub_participant_invitations WHERE token_hash=p_hash AND email=lower(p_email);
 IF NOT FOUND THEN RETURN jsonb_build_object('code','invalid_invitation'); END IF;
 PERFORM 1 FROM hub_organizations WHERE id=v_org FOR NO KEY UPDATE;
 SELECT * INTO v_inv FROM hub_participant_invitations WHERE token_hash=p_hash AND email=lower(p_email) FOR UPDATE;
 PERFORM 1 FROM hub_people WHERE organization_id=v_org AND id=v_inv.person_id AND NOT archived FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','invalid_invitation'); END IF;
 IF v_inv.accepted_by=p_actor AND EXISTS(SELECT 1 FROM hub_participant_links WHERE invitation_id=v_inv.id AND user_id=p_actor AND revoked_at IS NULL) THEN RETURN jsonb_build_object('organizationId',v_org); END IF;
 IF v_inv.revoked_at IS NOT NULL OR v_inv.expires_at<=clock_timestamp() OR v_inv.accepted_by IS NOT NULL OR NOT hub_is_admin(v_inv.created_by,v_org) THEN RETURN jsonb_build_object('code','invalid_invitation'); END IF;
 IF EXISTS(SELECT 1 FROM hub_memberships WHERE organization_id=v_org AND user_id=p_actor) THEN RETURN jsonb_build_object('code','participant_staff_conflict'); END IF;
 IF EXISTS(SELECT 1 FROM hub_participant_links WHERE organization_id=v_org AND (user_id=p_actor OR person_id=v_inv.person_id) AND revoked_at IS NULL) THEN RETURN jsonb_build_object('code','participant_linked'); END IF;
 INSERT INTO hub_participant_links(organization_id,person_id,user_id,invitation_id) VALUES(v_org,v_inv.person_id,p_actor,v_inv.id) RETURNING * INTO v_link;
 UPDATE hub_participant_invitations SET accepted_by=p_actor,accepted_at=clock_timestamp() WHERE id=v_inv.id;
 INSERT INTO hub_participant_events(organization_id,person_id,actor_id,action,entity_id) VALUES(v_org,v_inv.person_id,p_actor,'accept',v_link.id);
 RETURN jsonb_build_object('organizationId',v_org);
END; $$;
--> statement-breakpoint
CREATE FUNCTION hub_revoke_participant(p_actor text,p_org uuid,p_person uuid,p_id uuid,p_kind text,p_reason text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_changed uuid;
BEGIN
 PERFORM 1 FROM hub_organizations WHERE id=p_org FOR NO KEY UPDATE;
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin') FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 IF p_kind='invitation' THEN
  PERFORM 1 FROM hub_participant_invitations WHERE organization_id=p_org AND person_id=p_person AND id=p_id AND accepted_by IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
  UPDATE hub_participant_invitations SET revoked_at=clock_timestamp() WHERE id=p_id AND revoked_at IS NULL RETURNING id INTO v_changed;
 ELSIF p_kind='link' THEN
  IF length(btrim(p_reason)) NOT BETWEEN 1 AND 300 OR p_reason IS NULL THEN RETURN jsonb_build_object('code','participant_reason'); END IF;
  PERFORM 1 FROM hub_participant_links WHERE organization_id=p_org AND person_id=p_person AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
  UPDATE hub_participant_links SET revoked_at=clock_timestamp(),revoked_by=p_actor,revoke_reason=btrim(p_reason) WHERE id=p_id AND revoked_at IS NULL RETURNING id INTO v_changed;
  UPDATE hub_participant_invitations SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE organization_id=p_org AND person_id=p_person AND accepted_by IS NULL;
 ELSE RETURN jsonb_build_object('code','invalid_input'); END IF;
 IF v_changed IS NOT NULL THEN INSERT INTO hub_participant_events(organization_id,person_id,actor_id,action,entity_id) VALUES(p_org,p_person,p_actor,'revoke_'||p_kind,p_id); END IF;
 RETURN jsonb_build_object('id',p_id);
END; $$;
--> statement-breakpoint
CREATE FUNCTION hub_archive_participant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
 IF NEW.archived AND NOT OLD.archived THEN
  FOR v_id IN UPDATE hub_participant_links SET revoked_at=clock_timestamp(),revoke_reason='member_archived' WHERE organization_id=NEW.organization_id AND person_id=NEW.id AND revoked_at IS NULL RETURNING id LOOP
   INSERT INTO hub_participant_events(organization_id,person_id,actor_id,action,entity_id) VALUES(NEW.organization_id,NEW.id,NULL,'member_archived',v_id);
  END LOOP;
  UPDATE hub_participant_invitations SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE organization_id=NEW.organization_id AND person_id=NEW.id AND accepted_by IS NULL;
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER hub_archive_participant AFTER UPDATE OF archived ON hub_people FOR EACH ROW EXECUTE FUNCTION hub_archive_participant();
--> statement-breakpoint
CREATE FUNCTION hub_participant_link_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'participant link history is retained'; END IF;
 IF (to_jsonb(NEW)-ARRAY['revoked_at','revoked_by','revoke_reason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revoked_at','revoked_by','revoke_reason']) OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN RAISE EXCEPTION 'participant link cannot be reassigned'; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER hub_participant_link_immutable BEFORE UPDATE OR DELETE ON hub_participant_links FOR EACH ROW EXECUTE FUNCTION hub_participant_link_immutable();
--> statement-breakpoint
CREATE TRIGGER hub_participant_event_immutable BEFORE UPDATE OR DELETE ON hub_participant_events FOR EACH ROW EXECUTE FUNCTION hub_points_immutable();

--> statement-breakpoint
CREATE FUNCTION hub_participant_is_self(p_actor text,p_org uuid,p_person uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM hub_participant_links WHERE organization_id=p_org AND user_id=p_actor AND person_id=p_person);
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION hub_can_award(p_actor text,p_org uuid,p_person uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT NOT hub_participant_is_self(p_actor,p_org,p_person) AND (hub_is_admin(p_actor,p_org) OR EXISTS(SELECT 1 FROM hub_active_access(p_actor,p_org) v WHERE v.can_award AND
 (EXISTS(SELECT 1 FROM hub_group_people gp WHERE gp.organization_id=p_org AND gp.person_id=p_person AND gp.group_id=v.group_id) OR EXISTS(SELECT 1 FROM hub_activities a WHERE a.organization_id=p_org AND a.id=v.activity_id AND (cardinality(a.audience_group_ids)=0 OR EXISTS(SELECT 1 FROM hub_group_people gp WHERE gp.organization_id=p_org AND gp.person_id=p_person AND gp.group_id=ANY(a.audience_group_ids)))))));
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION hub_can_attend_person(p_actor text,p_org uuid,p_activity uuid,p_session uuid,p_person uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT NOT hub_participant_is_self(p_actor,p_org,p_person) AND (hub_is_admin(p_actor,p_org) OR EXISTS(SELECT 1 FROM hub_active_access(p_actor,p_org) v JOIN hub_activity_sessions s ON s.organization_id=p_org AND s.activity_id=p_activity AND s.id=p_session WHERE v.can_attend AND (v.activity_id=p_activity OR (v.group_id IS NOT NULL AND (cardinality(s.audience_group_ids)=0 OR v.group_id=ANY(s.audience_group_ids)) AND EXISTS(SELECT 1 FROM hub_group_people gp WHERE gp.organization_id=p_org AND gp.group_id=v.group_id AND gp.person_id=p_person)))));
$$;

--> statement-breakpoint
-- Invoker transaction: receipt deduplication, append-only awards/adjustments and serialized member balances.
CREATE OR REPLACE FUNCTION hub_save_points(p_actor text,p_org uuid,p_key uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
 v_receipt hub_points_requests%ROWTYPE;
 v_person hub_people%ROWTYPE;
 v_original hub_points_entries%ROWTYPE;
 v_request uuid;
 v_id uuid;
 v_results jsonb := '[]'::jsonb;
 v_kind text := p_payload->>'kind';
 v_amount integer := (p_payload->>'amount')::integer;
 v_reason text := p_payload->>'reason';
 v_current integer;
 v_version integer;
 v_delta integer;
 v_date timestamptz;
 v_activity uuid := (p_payload->>'activityId')::uuid;
 v_session uuid := (p_payload->>'sessionId')::uuid;
BEGIN
 -- Organization lock serializes receipts across different staff accounts, including same-key retries.
 PERFORM 1 FROM hub_organizations WHERE id=p_org FOR NO KEY UPDATE;
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin','volunteer') FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 IF v_kind IS NULL OR v_kind NOT IN ('award','correct') OR v_amount IS NULL OR v_amount NOT BETWEEN 0 AND 10000 OR (v_kind='award' AND v_amount=0) OR v_reason IS NULL OR length(trim(v_reason)) NOT BETWEEN 1 AND 300 OR jsonb_typeof(p_payload->'people') IS DISTINCT FROM 'array' THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 IF jsonb_array_length(p_payload->'people') NOT BETWEEN 1 AND 50 OR (SELECT count(DISTINCT value::text::uuid) FROM jsonb_array_elements_text(p_payload->'people'))<>jsonb_array_length(p_payload->'people') THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 PERFORM 1 FROM hub_people WHERE organization_id=p_org AND id IN (SELECT value::uuid FROM jsonb_array_elements_text(p_payload->'people')) ORDER BY id FOR UPDATE;
 PERFORM hub_lock_access(p_actor,p_org);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'people') item WHERE hub_participant_is_self(p_actor,p_org,item::uuid)) THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 IF NOT hub_is_admin(p_actor,p_org) AND (v_kind<>'award' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'people') item WHERE NOT hub_can_award(p_actor,p_org,item::uuid))) THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 IF NOT hub_is_admin(p_actor,p_org) AND v_activity IS NOT NULL AND NOT hub_can_view_activity(p_actor,p_org,v_activity) THEN RETURN jsonb_build_object('code','not_found'); END IF;
 IF NOT hub_is_admin(p_actor,p_org) AND v_session IS NOT NULL AND NOT hub_can_view_session(p_actor,p_org,v_activity,v_session) THEN RETURN jsonb_build_object('code','not_found'); END IF;
 SELECT * INTO v_receipt FROM hub_points_requests WHERE organization_id=p_org AND request_key=p_key;
 IF FOUND THEN
  IF v_receipt.actor_id<>p_actor OR v_receipt.payload<>p_payload THEN RETURN jsonb_build_object('code','points_key_conflict'); END IF;
  RETURN v_receipt.response;
 END IF;
 IF v_kind='award' THEN
  v_date := (p_payload->>'occurredAt')::timestamptz;
  IF v_date IS NULL OR v_date>clock_timestamp() OR v_date<'2000-01-01T00:00Z'::timestamptz THEN RETURN jsonb_build_object('code','points_date'); END IF;
  IF (v_session IS NOT NULL AND v_activity IS NULL) OR (v_activity IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hub_activities WHERE organization_id=p_org AND id=v_activity)) OR (v_session IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hub_activity_sessions WHERE organization_id=p_org AND activity_id=v_activity AND id=v_session)) THEN RETURN jsonb_build_object('code','not_found'); END IF;
 ELSIF jsonb_array_length(p_payload->'people')<>1 OR (p_payload->>'version') IS NULL OR (p_payload->>'version')::integer<1 OR v_activity IS NOT NULL OR v_session IS NOT NULL THEN RETURN jsonb_build_object('code','invalid_input');
 END IF;
 INSERT INTO hub_points_requests(organization_id,request_key,actor_id,payload,response) VALUES(p_org,p_key,p_actor,p_payload,'{}') RETURNING id INTO v_request;
 FOR v_id IN SELECT value::uuid FROM jsonb_array_elements_text(p_payload->'people') ORDER BY value LOOP
  SELECT * INTO v_person FROM hub_people WHERE organization_id=p_org AND id=v_id FOR UPDATE;
  IF NOT FOUND THEN v_results := v_results || jsonb_build_array(jsonb_build_object('personId',v_id,'name','','outcome','ineligible')); CONTINUE; END IF;
  IF v_kind='award' AND v_person.archived THEN v_results := v_results || jsonb_build_array(jsonb_build_object('personId',v_id,'name',v_person.name,'outcome','ineligible')); CONTINUE; END IF;
  IF v_kind='correct' THEN
   SELECT * INTO v_original FROM hub_points_entries WHERE organization_id=p_org AND person_id=v_id AND id=(p_payload->>'originalId')::uuid AND original_id IS NULL;
   IF NOT FOUND THEN v_results := v_results || jsonb_build_array(jsonb_build_object('personId',v_id,'name',v_person.name,'outcome','ineligible')); CONTINUE; END IF;
   IF v_original.source='attendance' THEN v_results := v_results || jsonb_build_array(jsonb_build_object('personId',v_id,'name',v_person.name,'outcome','managed')); CONTINUE; END IF;
   SELECT (v_original.amount+coalesce(sum(amount),0))::integer,(count(*)+1)::integer INTO v_current,v_version FROM hub_points_entries WHERE organization_id=p_org AND person_id=v_id AND original_id=v_original.id;
   IF v_version<>(p_payload->>'version')::integer THEN v_results := v_results || jsonb_build_array(jsonb_build_object('personId',v_id,'name',v_person.name,'outcome','conflict')); CONTINUE; END IF;
   v_delta := v_amount-v_current;
   IF v_delta=0 THEN v_results := v_results || jsonb_build_array(jsonb_build_object('personId',v_id,'name',v_person.name,'outcome','unchanged')); CONTINUE; END IF;
   v_date := v_original.occurred_at;
  ELSE v_delta := v_amount;
  END IF;
  INSERT INTO hub_points_entries(organization_id,person_id,request_id,actor_id,amount,reason,original_id,activity_id,session_id,occurred_at)
  VALUES(p_org,v_id,v_request,p_actor,v_delta,v_reason,CASE WHEN v_kind='correct' THEN v_original.id ELSE NULL END,CASE WHEN v_kind='correct' THEN v_original.activity_id ELSE v_activity END,CASE WHEN v_kind='correct' THEN v_original.session_id ELSE v_session END,v_date);
  v_results := v_results || jsonb_build_array(jsonb_build_object('personId',v_id,'name',v_person.name,'outcome','saved'));
 END LOOP;
 UPDATE hub_points_requests SET response=jsonb_build_object('items',v_results) WHERE id=v_request;
 RETURN jsonb_build_object('items',v_results);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN
 RETURN jsonb_build_object('code','invalid_input');
END;
$$;
-- Protect ledger history from accidental edits through application SQL.
--> statement-breakpoint
CREATE OR REPLACE FUNCTION hub_save_redemption(p_actor text,p_org uuid,p_reward uuid,p_id uuid,p_key uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_reward hub_rewards%ROWTYPE;v_old hub_redemptions%ROWTYPE;v_new hub_redemptions%ROWTYPE;v_person hub_people%ROWTYPE;v_name text;v_available bigint;v_used bigint;
BEGIN
 PERFORM 1 FROM hub_organizations WHERE id=p_org FOR NO KEY UPDATE;
 SELECT coalesce(display_name,'') INTO v_name FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin') FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 SELECT * INTO v_reward FROM hub_rewards WHERE organization_id=p_org AND id=p_reward FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 IF p_id IS NULL THEN
  SELECT * INTO v_old FROM hub_redemptions WHERE organization_id=p_org AND creation_key=p_key;
  IF FOUND THEN
   IF v_old.created_by<>p_actor OR v_old.reward_id<>p_reward OR v_old.request IS DISTINCT FROM p_payload THEN RETURN jsonb_build_object('code','conflict'); END IF;
   RETURN jsonb_build_object('id',v_old.id);
  END IF;
  IF v_reward.archived THEN RETURN jsonb_build_object('code','reward_archived'); END IF;
  IF v_reward.version IS DISTINCT FROM (p_payload->>'rewardVersion')::integer THEN RETURN jsonb_build_object('code','conflict'); END IF;
  SELECT * INTO v_person FROM hub_people WHERE organization_id=p_org AND id=(p_payload->>'personId')::uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
  IF v_person.archived THEN RETURN jsonb_build_object('code','reward_member_archived'); END IF;
  SELECT available INTO v_available FROM hub_reward_wallet(p_org,v_person.id);
  IF v_available<v_reward.cost THEN RETURN jsonb_build_object('code','reward_balance'); END IF;
  SELECT count(*) INTO v_used FROM hub_redemptions WHERE organization_id=p_org AND reward_id=p_reward AND status<>'cancelled';
  IF v_reward.stock IS NOT NULL AND v_used>=v_reward.stock THEN RETURN jsonb_build_object('code','reward_out_of_stock'); END IF;
  INSERT INTO hub_redemptions(organization_id,reward_id,person_id,reward_name,person_name,cost,request,created_by,created_by_name,creation_key)
  VALUES(p_org,p_reward,v_person.id,v_reward.name,v_person.name,v_reward.cost,p_payload,p_actor,v_name,p_key) RETURNING * INTO v_new;
 ELSE
  SELECT * INTO v_old FROM hub_redemptions WHERE organization_id=p_org AND reward_id=p_reward AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
  IF p_payload->>'action'='fulfilled' AND hub_participant_is_self(p_actor,p_org,v_old.person_id) THEN RETURN jsonb_build_object('code','forbidden'); END IF;
  IF v_old.status=p_payload->>'action' AND v_old.status IN ('fulfilled','cancelled') THEN RETURN jsonb_build_object('id',v_old.id); END IF;
  IF v_old.status<>'pending' OR v_old.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RETURN jsonb_build_object('code','conflict'); END IF;
  IF p_payload->>'action'='fulfilled' THEN
   UPDATE hub_redemptions SET status='fulfilled',fulfilled_at=clock_timestamp(),fulfilled_by=p_actor,fulfilled_by_name=v_name,version=version+1 WHERE id=p_id RETURNING * INTO v_new;
  ELSIF p_payload->>'action'='cancelled' THEN
   IF length(btrim(p_payload->>'reason')) NOT BETWEEN 1 AND 300 OR p_payload->>'reason' IS NULL THEN RETURN jsonb_build_object('code','reward_reason'); END IF;
   UPDATE hub_redemptions SET status='cancelled',cancelled_at=clock_timestamp(),cancelled_by=p_actor,cancelled_by_name=v_name,cancel_reason=btrim(p_payload->>'reason'),version=version+1 WHERE id=p_id RETURNING * INTO v_new;
  ELSE RETURN jsonb_build_object('code','invalid_input'); END IF;
 END IF;
 INSERT INTO hub_reward_changes(organization_id,reward_id,redemption_id,actor_id,action,before,after) VALUES(p_org,p_reward,v_new.id,p_actor,coalesce(p_payload->>'action','redeem'),CASE WHEN p_id IS NOT NULL THEN to_jsonb(v_old) ELSE NULL END,to_jsonb(v_new));
 RETURN jsonb_build_object('id',v_new.id);
EXCEPTION WHEN check_violation OR not_null_violation OR invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('code','invalid_input');
END; $$;

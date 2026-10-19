CREATE FUNCTION hub_reward_wallet(p_org uuid,p_person uuid) RETURNS TABLE(earned bigint,reserved bigint,spent bigint,available bigint) LANGUAGE sql STABLE AS $$
 WITH e AS(SELECT coalesce(sum(amount),0)::bigint AS total FROM hub_points_entries WHERE organization_id=p_org AND person_id=p_person),
 r AS(SELECT coalesce(sum(cost) FILTER(WHERE status='pending'),0)::bigint AS reserved,coalesce(sum(cost) FILTER(WHERE status='fulfilled'),0)::bigint AS spent FROM hub_redemptions WHERE organization_id=p_org AND person_id=p_person)
 SELECT e.total,r.reserved,r.spent,e.total-r.reserved-r.spent FROM e CROSS JOIN r;
$$;
--> statement-breakpoint
CREATE FUNCTION hub_save_reward(p_actor text,p_org uuid,p_id uuid,p_key uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_old hub_rewards%ROWTYPE;v_new hub_rewards%ROWTYPE;v_used bigint;
BEGIN
 PERFORM 1 FROM hub_organizations WHERE id=p_org FOR NO KEY UPDATE;
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin') FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 IF p_id IS NULL THEN
  SELECT * INTO v_old FROM hub_rewards WHERE organization_id=p_org AND creation_key=p_key;
  IF FOUND THEN
   IF v_old.created_by<>p_actor THEN RETURN jsonb_build_object('code','conflict'); END IF;
   RETURN jsonb_build_object('id',v_old.id);
  END IF;
  INSERT INTO hub_rewards(organization_id,name,description,cost,stock,created_by,creation_key) VALUES(p_org,p_payload->>'name',p_payload->>'description',(p_payload->>'cost')::integer,(p_payload->>'stock')::integer,p_actor,p_key) RETURNING * INTO v_new;
 ELSE
  SELECT * INTO v_old FROM hub_rewards WHERE organization_id=p_org AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
  IF v_old.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RETURN jsonb_build_object('code','conflict'); END IF;
  IF p_payload->>'action'='archive' THEN
   UPDATE hub_rewards SET archived=(p_payload->>'archived')::boolean,version=version+1 WHERE id=p_id RETURNING * INTO v_new;
  ELSIF p_payload->>'action'='edit' THEN
   SELECT count(*) INTO v_used FROM hub_redemptions WHERE organization_id=p_org AND reward_id=p_id AND status<>'cancelled';
   IF (p_payload->>'stock')::integer<v_used THEN RETURN jsonb_build_object('code','reward_stock_used'); END IF;
   UPDATE hub_rewards SET name=p_payload->>'name',description=p_payload->>'description',cost=(p_payload->>'cost')::integer,stock=(p_payload->>'stock')::integer,version=version+1 WHERE id=p_id RETURNING * INTO v_new;
  ELSE RETURN jsonb_build_object('code','invalid_input'); END IF;
 END IF;
 INSERT INTO hub_reward_changes(organization_id,reward_id,actor_id,action,before,after) VALUES(p_org,v_new.id,p_actor,coalesce(p_payload->>'action','create'),CASE WHEN p_id IS NOT NULL THEN to_jsonb(v_old) ELSE NULL END,to_jsonb(v_new));
 RETURN jsonb_build_object('id',v_new.id);
EXCEPTION WHEN check_violation OR not_null_violation OR invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('code','invalid_input');
END; $$;
--> statement-breakpoint
CREATE FUNCTION hub_save_redemption(p_actor text,p_org uuid,p_reward uuid,p_id uuid,p_key uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
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
--> statement-breakpoint
CREATE FUNCTION hub_protect_redemption() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'redemptions are retained'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','version','fulfilled_at','fulfilled_by','fulfilled_by_name','cancelled_at','cancelled_by','cancelled_by_name','cancel_reason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','fulfilled_at','fulfilled_by','fulfilled_by_name','cancelled_at','cancelled_by','cancelled_by_name','cancel_reason']) OR OLD.status<>'pending' OR NEW.status NOT IN ('fulfilled','cancelled') OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'invalid redemption transition'; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER hub_protect_redemption BEFORE UPDATE OR DELETE ON hub_redemptions FOR EACH ROW EXECUTE FUNCTION hub_protect_redemption();
--> statement-breakpoint
CREATE TRIGGER hub_reward_audit_immutable BEFORE UPDATE OR DELETE ON hub_reward_changes FOR EACH ROW EXECUTE FUNCTION hub_points_immutable();

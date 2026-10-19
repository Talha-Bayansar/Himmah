CREATE TABLE "hub_reward_coupons" (
	"redemption_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text DEFAULT replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','') NOT NULL,
	CONSTRAINT "hub_reward_coupons_code_unique" UNIQUE("code"),
	CONSTRAINT "hub_coupon_code" CHECK ("hub_reward_coupons"."code" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "hub_reward_coupons" ADD CONSTRAINT "hub_reward_coupons_organization_id_redemption_id_hub_redemptions_organization_id_id_fk" FOREIGN KEY ("organization_id","redemption_id") REFERENCES "public"."hub_redemptions"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION hub_issue_coupon() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO hub_reward_coupons(organization_id,redemption_id) VALUES(NEW.organization_id,NEW.id);
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER hub_issue_coupon AFTER INSERT ON hub_redemptions FOR EACH ROW EXECUTE FUNCTION hub_issue_coupon();
--> statement-breakpoint
-- Existing pending reservations gain collection codes; balances and histories are not changed.
INSERT INTO hub_reward_coupons(organization_id,redemption_id) SELECT organization_id,id FROM hub_redemptions WHERE status='pending';
--> statement-breakpoint
CREATE TRIGGER hub_coupon_immutable BEFORE UPDATE OR DELETE ON hub_reward_coupons FOR EACH ROW EXECUTE FUNCTION hub_points_immutable();
--> statement-breakpoint
CREATE FUNCTION hub_claim_reward(p_actor text,p_org uuid,p_reward uuid,p_key uuid,p_version integer) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_person hub_people%ROWTYPE;v_reward hub_rewards%ROWTYPE;v_old hub_redemptions%ROWTYPE;v_new hub_redemptions%ROWTYPE;v_request jsonb;v_available bigint;v_used bigint;v_person_id uuid;
BEGIN
 PERFORM 1 FROM hub_organizations WHERE id=p_org FOR NO KEY UPDATE;
 v_person_id:=hub_participant_person(p_actor,p_org);
 IF v_person_id IS NULL THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 PERFORM 1 FROM hub_participant_links WHERE organization_id=p_org AND user_id=p_actor AND person_id=v_person_id AND revoked_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 SELECT * INTO v_person FROM hub_people WHERE organization_id=p_org AND id=v_person_id AND NOT archived FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 IF p_key IS NULL OR p_version IS NULL OR p_version<1 THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 v_request:=jsonb_build_object('source','participant','rewardVersion',p_version);
 SELECT * INTO v_old FROM hub_redemptions WHERE organization_id=p_org AND creation_key=p_key;
 IF FOUND THEN
  IF v_old.created_by<>p_actor OR v_old.person_id<>v_person_id OR v_old.reward_id<>p_reward OR v_old.request IS DISTINCT FROM v_request THEN RETURN jsonb_build_object('code','conflict'); END IF;
  RETURN jsonb_build_object('id',v_old.id);
 END IF;
 SELECT * INTO v_reward FROM hub_rewards WHERE organization_id=p_org AND id=p_reward FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 IF v_reward.archived THEN RETURN jsonb_build_object('code','reward_archived'); END IF;
 IF v_reward.version<>p_version THEN RETURN jsonb_build_object('code','conflict'); END IF;
 SELECT available INTO v_available FROM hub_reward_wallet(p_org,v_person_id);
 IF v_available<v_reward.cost THEN RETURN jsonb_build_object('code','reward_balance'); END IF;
 SELECT count(*) INTO v_used FROM hub_redemptions WHERE organization_id=p_org AND reward_id=p_reward AND status<>'cancelled';
 IF v_reward.stock IS NOT NULL AND v_used>=v_reward.stock THEN RETURN jsonb_build_object('code','reward_out_of_stock'); END IF;
 INSERT INTO hub_redemptions(organization_id,reward_id,person_id,reward_name,person_name,cost,request,created_by,created_by_name,creation_key)
 VALUES(p_org,p_reward,v_person_id,v_reward.name,v_person.name,v_reward.cost,v_request,p_actor,v_person.name,p_key) RETURNING * INTO v_new;
 INSERT INTO hub_reward_changes(organization_id,reward_id,redemption_id,actor_id,action,after) VALUES(p_org,p_reward,v_new.id,p_actor,'participant_claim',to_jsonb(v_new));
 RETURN jsonb_build_object('id',v_new.id);
END; $$;
--> statement-breakpoint
CREATE FUNCTION hub_cancel_my_coupon(p_actor text,p_org uuid,p_id uuid,p_version integer) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_person uuid;v_old hub_redemptions%ROWTYPE;v_new hub_redemptions%ROWTYPE;v_name text;
BEGIN
 PERFORM 1 FROM hub_organizations WHERE id=p_org FOR NO KEY UPDATE;
 v_person:=hub_participant_person(p_actor,p_org);
 IF v_person IS NULL THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 PERFORM 1 FROM hub_participant_links WHERE organization_id=p_org AND user_id=p_actor AND person_id=v_person AND revoked_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 SELECT name INTO v_name FROM hub_people WHERE organization_id=p_org AND id=v_person AND NOT archived FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 SELECT * INTO v_old FROM hub_redemptions WHERE organization_id=p_org AND id=p_id AND person_id=v_person FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 IF v_old.status='cancelled' THEN RETURN jsonb_build_object('id',p_id); END IF;
 IF v_old.status<>'pending' OR v_old.version IS DISTINCT FROM p_version THEN RETURN jsonb_build_object('code','conflict'); END IF;
 UPDATE hub_redemptions SET status='cancelled',cancelled_at=clock_timestamp(),cancelled_by=p_actor,cancelled_by_name=v_name,cancel_reason='participant_cancelled',version=version+1 WHERE id=p_id RETURNING * INTO v_new;
 INSERT INTO hub_reward_changes(organization_id,reward_id,redemption_id,actor_id,action,before,after) VALUES(p_org,v_old.reward_id,p_id,p_actor,'participant_cancel',to_jsonb(v_old),to_jsonb(v_new));
 RETURN jsonb_build_object('id',p_id);
END; $$;
--> statement-breakpoint
CREATE FUNCTION hub_collect_coupon(p_actor text,p_org uuid,p_code text,p_version integer) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_old hub_redemptions%ROWTYPE;
BEGIN
 PERFORM 1 FROM hub_organizations WHERE id=p_org FOR NO KEY UPDATE;
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin') FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 SELECT r.* INTO v_old FROM hub_redemptions r JOIN hub_reward_coupons c ON c.organization_id=r.organization_id AND c.redemption_id=r.id WHERE c.organization_id=p_org AND c.code=p_code;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 RETURN hub_save_redemption(p_actor,p_org,v_old.reward_id,v_old.id,NULL,jsonb_build_object('action','fulfilled','version',p_version));
END; $$;

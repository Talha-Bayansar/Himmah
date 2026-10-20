-- Recipient snapshots prevent a relinked account from inheriting another person's history.
CREATE FUNCTION hub_notification_visible(n hub_notifications,p_user text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT n.user_id=p_user AND CASE WHEN n.admin_only THEN hub_is_admin(p_user,n.organization_id)
 ELSE EXISTS(SELECT 1 FROM hub_participant_links l JOIN hub_people p ON p.organization_id=l.organization_id AND p.id=l.person_id WHERE l.id=n.participant_link_id AND l.organization_id=n.organization_id AND l.user_id=p_user AND l.revoked_at IS NULL AND NOT p.archived) END;
$$;
--> statement-breakpoint
CREATE FUNCTION hub_notify_person(p_org uuid,p_person uuid,p_event uuid,p_kind text,p_href text) RETURNS void LANGUAGE sql AS $$
 INSERT INTO hub_notifications(organization_id,user_id,participant_link_id,event_id,kind,href)
 SELECT p_org,l.user_id,l.id,p_event,p_kind,p_href FROM hub_participant_links l JOIN hub_people p ON p.organization_id=l.organization_id AND p.id=l.person_id
 WHERE l.organization_id=p_org AND l.person_id=p_person AND l.revoked_at IS NULL AND NOT p.archived
 ON CONFLICT DO NOTHING;
$$;
--> statement-breakpoint
CREATE FUNCTION hub_notify_admins(p_org uuid,p_event uuid,p_kind text,p_href text,p_actor text) RETURNS void LANGUAGE sql AS $$
 INSERT INTO hub_notifications(organization_id,user_id,admin_only,event_id,kind,href)
 SELECT p_org,m.user_id,true,p_event,p_kind,p_href FROM hub_memberships m WHERE m.organization_id=p_org AND m.role IN ('owner','admin') AND m.user_id<>p_actor ON CONFLICT DO NOTHING;
$$;
--> statement-breakpoint
CREATE FUNCTION hub_notification_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE base text:='/workspace/'||NEW.organization_id::text; person uuid;
BEGIN
 IF TG_TABLE_NAME='hub_points_entries' THEN
  -- A challenge approval has its own notification; corrections still notify.
  IF NEW.source<>'challenge' OR NEW.original_id IS NOT NULL THEN
   PERFORM hub_notify_person(NEW.organization_id,NEW.person_id,NEW.id,CASE WHEN NEW.original_id IS NULL THEN 'points_awarded' ELSE 'points_corrected' END,base||'/me');
  END IF;
 ELSIF TG_TABLE_NAME='hub_challenge_events' THEN
  IF NEW.submission_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.action='submit' THEN
   PERFORM hub_notify_admins(NEW.organization_id,NEW.id,'challenge_pending',base||'/challenges/'||NEW.challenge_id::text||'/submissions/'||NEW.submission_id::text,NEW.actor_id);
  ELSIF NEW.action IN ('approve','reject','record') THEN
   PERFORM hub_notify_person(NEW.organization_id,(NEW.after->>'person_id')::uuid,NEW.id,CASE WHEN NEW.action='reject' THEN 'challenge_feedback' ELSE 'challenge_approved' END,base||'/challenges/'||NEW.challenge_id::text);
  END IF;
 ELSIF TG_TABLE_NAME='hub_reward_changes' THEN
  IF NEW.redemption_id IS NULL THEN RETURN NEW; END IF;
  person:=(NEW.after->>'person_id')::uuid;
  IF NEW.action IN ('participant_claim','redeem') THEN
   PERFORM hub_notify_admins(NEW.organization_id,NEW.id,'reward_pending',base||'/rewards/'||NEW.reward_id::text||'?view=redemptions',NEW.actor_id);
   PERFORM hub_notify_person(NEW.organization_id,person,NEW.id,'reward_reserved',base||'/my-coupons/'||NEW.redemption_id::text);
  ELSIF NEW.action IN ('fulfilled','cancelled','participant_cancel') THEN
   PERFORM hub_notify_person(NEW.organization_id,person,NEW.id,CASE WHEN NEW.action='fulfilled' THEN 'reward_collected' ELSE 'reward_cancelled' END,base||'/my-coupons/'||NEW.redemption_id::text);
  END IF;
 END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER hub_points_notify AFTER INSERT ON hub_points_entries FOR EACH ROW EXECUTE FUNCTION hub_notification_event();
--> statement-breakpoint
CREATE TRIGGER hub_challenge_notify AFTER INSERT ON hub_challenge_events FOR EACH ROW EXECUTE FUNCTION hub_notification_event();
--> statement-breakpoint
CREATE TRIGGER hub_reward_notify AFTER INSERT ON hub_reward_changes FOR EACH ROW EXECUTE FUNCTION hub_notification_event();
--> statement-breakpoint
CREATE FUNCTION hub_enqueue_push() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO hub_push_deliveries(notification_id,device_id) SELECT NEW.id,d.id FROM hub_push_devices d WHERE d.user_id=NEW.user_id ON CONFLICT DO NOTHING;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER hub_push_enqueue AFTER INSERT ON hub_notifications FOR EACH ROW EXECUTE FUNCTION hub_enqueue_push();
--> statement-breakpoint
-- Atomic per-account registration limit; an endpoint cannot change owner silently.
CREATE FUNCTION hub_register_push(p_user text,p_endpoint text,p_key text,p_auth text,p_locale text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE owner text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('push:'||p_user,0));
 SELECT user_id INTO owner FROM hub_push_devices WHERE endpoint=p_endpoint FOR UPDATE;
 IF FOUND AND owner<>p_user THEN RETURN false; END IF;
 IF owner IS NULL AND (SELECT count(*) FROM hub_push_devices WHERE user_id=p_user)>=10 THEN RETURN false; END IF;
 INSERT INTO hub_push_devices(user_id,endpoint,p256dh,auth,locale) VALUES(p_user,p_endpoint,p_key,p_auth,p_locale)
 ON CONFLICT(endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,locale=EXCLUDED.locale WHERE hub_push_devices.user_id=p_user;
 RETURN FOUND;
END; $$;

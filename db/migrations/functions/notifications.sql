CREATE FUNCTION hub_notification_visible(n hub_notifications,p_user text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT n.user_id=p_user AND EXISTS(SELECT 1 FROM hub_memberships WHERE organization_id=n.organization_id AND user_id=p_user);
$$;
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

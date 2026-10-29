-- The same session row lock used by registration commands serializes price publication.
CREATE OR REPLACE FUNCTION hub_session_price_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.price_minor<>OLD.price_minor AND (OLD.starts_at<=clock_timestamp() OR EXISTS(SELECT 1 FROM hub_registration_charges WHERE organization_id=OLD.organization_id AND session_id=OLD.id) OR EXISTS(SELECT 1 FROM hub_session_registrations WHERE organization_id=OLD.organization_id AND session_id=OLD.id)) THEN
  RAISE check_violation USING MESSAGE='Session pricing is locked';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER hub_session_price_guard BEFORE UPDATE OF price_minor ON hub_activity_sessions FOR EACH ROW EXECUTE FUNCTION hub_session_price_guard();
CREATE TRIGGER hub_charge_immutable BEFORE UPDATE OR DELETE ON hub_registration_charges FOR EACH ROW EXECUTE FUNCTION hub_history_immutable();

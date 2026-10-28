-- Read-only projections let scheduling use the canonical People records.
CREATE VIEW himmah.activity_contacts AS SELECT id,organization_id,display_name AS name,(archived_at IS NOT NULL) AS archived,version,created_at FROM himmah.contacts;
CREATE VIEW himmah.activity_groups AS SELECT id,organization_id,name,(archived_at IS NOT NULL) AS archived,version,created_at FROM himmah.groups;
CREATE VIEW himmah.activity_memberships AS SELECT organization_id,group_id,contact_id AS person_id,created_at FROM himmah.group_memberships WHERE valid_to IS NULL;
CREATE FUNCTION hub_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'History is immutable'; END $$;
CREATE TRIGGER hub_attendance_history_immutable BEFORE UPDATE OR DELETE ON hub_attendance_changes FOR EACH ROW EXECUTE FUNCTION hub_history_immutable();

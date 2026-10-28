-- Additive hosted adapter. Existing Hub organization/staff membership is authoritative.
-- Installs only after the People module. Never copies legacy people, methods or family data.
CREATE OR REPLACE FUNCTION himmah.sync_hosted_organization() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,himmah AS $$
BEGIN
 INSERT INTO himmah.organizations(id,name,created_by,updated_by) VALUES(NEW.id,left(NEW.name,100),NEW.created_by,NEW.created_by)
 ON CONFLICT(id) DO UPDATE SET name=excluded.name,version=himmah.organizations.version+1,updated_at=clock_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER himmah_people_organization AFTER INSERT OR UPDATE OF name ON public.hub_organizations FOR EACH ROW EXECUTE FUNCTION himmah.sync_hosted_organization();
CREATE OR REPLACE FUNCTION himmah.sync_hosted_membership() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,himmah AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  UPDATE himmah.staff_memberships SET active=false,version=version+1,updated_at=clock_timestamp() WHERE organization_id=OLD.organization_id AND user_id=OLD.user_id;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND (OLD.organization_id<>NEW.organization_id OR OLD.user_id<>NEW.user_id) THEN
  UPDATE himmah.staff_memberships SET active=false,version=version+1,updated_at=clock_timestamp() WHERE organization_id=OLD.organization_id AND user_id=OLD.user_id;
 END IF;
 IF NEW.role IN('owner','admin','volunteer') THEN
  INSERT INTO himmah.staff_memberships(organization_id,user_id,role,active,created_by,updated_by) VALUES(NEW.organization_id,NEW.user_id,NEW.role,true,NEW.user_id,NEW.user_id)
  ON CONFLICT(organization_id,user_id) DO UPDATE SET role=excluded.role,active=true,version=himmah.staff_memberships.version+1,updated_at=clock_timestamp();
 ELSE
  UPDATE himmah.staff_memberships SET active=false,version=version+1,updated_at=clock_timestamp() WHERE organization_id=NEW.organization_id AND user_id=NEW.user_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER himmah_people_membership AFTER INSERT OR UPDATE OR DELETE ON public.hub_memberships FOR EACH ROW EXECUTE FUNCTION himmah.sync_hosted_membership();
INSERT INTO himmah.organizations(id,name,created_by,updated_by)
 SELECT id,left(name,100),created_by,created_by FROM public.hub_organizations;
INSERT INTO himmah.staff_memberships(organization_id,user_id,role,created_by,updated_by)
 SELECT organization_id,user_id,role,user_id,user_id FROM public.hub_memberships WHERE role IN('owner','admin','volunteer');

CREATE TABLE "hub_engagement_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"timezone" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" text,
	"created_by" text NOT NULL,
	"creation_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_period_scope" UNIQUE("organization_id","id"),
	CONSTRAINT "hub_period_creation" UNIQUE("organization_id","creation_key"),
	CONSTRAINT "hub_period_dates" CHECK ("hub_engagement_periods"."start_date">='2000-01-01' and "hub_engagement_periods"."end_date"<='2100-12-31' and "hub_engagement_periods"."end_date">="hub_engagement_periods"."start_date"),
	CONSTRAINT "hub_period_name" CHECK (length(trim("hub_engagement_periods"."name")) between 2 and 80),
	CONSTRAINT "hub_period_version" CHECK ("hub_engagement_periods"."version">0),
	CONSTRAINT "hub_period_closed" CHECK (("hub_engagement_periods"."closed_at" is null)=("hub_engagement_periods"."closed_by" is null))
);
--> statement-breakpoint
CREATE TABLE "hub_period_groups" (
	"organization_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"archived" boolean NOT NULL,
	"group_created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "hub_period_groups_organization_id_period_id_group_id_pk" PRIMARY KEY("organization_id","period_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "hub_period_members" (
	"organization_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"name" text NOT NULL,
	"archived" boolean NOT NULL,
	"person_created_at" timestamp with time zone NOT NULL,
	"points" bigint NOT NULL,
	"present" integer NOT NULL,
	"absent" integer NOT NULL,
	"excused" integer NOT NULL,
	"unmarked" integer NOT NULL,
	"group_ids" uuid[] NOT NULL,
	CONSTRAINT "hub_period_members_organization_id_period_id_person_id_pk" PRIMARY KEY("organization_id","period_id","person_id")
);
--> statement-breakpoint
ALTER TABLE "hub_engagement_periods" ADD CONSTRAINT "hub_engagement_periods_organization_id_hub_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."hub_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_period_groups" ADD CONSTRAINT "hub_period_groups_organization_id_period_id_hub_engagement_periods_organization_id_id_fk" FOREIGN KEY ("organization_id","period_id") REFERENCES "public"."hub_engagement_periods"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_period_groups" ADD CONSTRAINT "hub_period_groups_organization_id_group_id_hub_groups_organization_id_id_fk" FOREIGN KEY ("organization_id","group_id") REFERENCES "public"."hub_groups"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_period_members" ADD CONSTRAINT "hub_period_members_organization_id_period_id_hub_engagement_periods_organization_id_id_fk" FOREIGN KEY ("organization_id","period_id") REFERENCES "public"."hub_engagement_periods"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_period_members" ADD CONSTRAINT "hub_period_members_organization_id_person_id_hub_people_organization_id_id_fk" FOREIGN KEY ("organization_id","person_id") REFERENCES "public"."hub_people"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hub_period_page" ON "hub_engagement_periods" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX "hub_period_member_page" ON "hub_period_members" USING btree ("organization_id","period_id","person_created_at","person_id");
--> statement-breakpoint
-- One row per roster member: point occurrence time and session start time define the window.
CREATE FUNCTION hub_period_live_members(p_org uuid,p_start date,p_end date,p_zone text)
RETURNS TABLE(person_id uuid,name text,archived boolean,person_created_at timestamptz,points bigint,present integer,absent integer,excused integer,unmarked integer,group_ids uuid[])
LANGUAGE sql STABLE AS $$
 SELECT p.id,p.name,p.archived,p.created_at,
 coalesce((SELECT sum(e.amount) FROM hub_points_entries e WHERE e.organization_id=p_org AND e.person_id=p.id AND e.occurred_at >= (p_start::timestamp AT TIME ZONE p_zone) AND e.occurred_at < ((p_end+1)::timestamp AT TIME ZONE p_zone)),0)::bigint,
 a.present,a.absent,a.excused,a.unmarked,
 ARRAY(SELECT gp.group_id FROM hub_group_people gp WHERE gp.organization_id=p_org AND gp.person_id=p.id ORDER BY gp.group_id)
 FROM hub_people p CROSS JOIN LATERAL (
 SELECT count(*) FILTER(WHERE a.status='present')::integer AS present,count(*) FILTER(WHERE a.status='absent')::integer AS absent,count(*) FILTER(WHERE a.status='excused')::integer AS excused,count(*) FILTER(WHERE a.status='unmarked')::integer AS unmarked
 FROM hub_attendance a JOIN hub_activity_sessions s ON s.organization_id=a.organization_id AND s.id=a.session_id
 WHERE a.organization_id=p_org AND a.person_id=p.id AND NOT s.cancelled AND s.starts_at >= (p_start::timestamp AT TIME ZONE p_zone) AND s.starts_at < ((p_end+1)::timestamp AT TIME ZONE p_zone)
 ) a WHERE p.organization_id=p_org;
$$;
--> statement-breakpoint
CREATE FUNCTION hub_save_period(p_actor text,p_org uuid,p_id uuid,p_key uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_period hub_engagement_periods%ROWTYPE; v_id uuid; v_zone text;
BEGIN
 -- Share the point-write lock; the closing snapshot itself is one MVCC statement.
 SELECT timezone INTO v_zone FROM hub_organizations WHERE id=p_org FOR NO KEY UPDATE;
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin') FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 IF p_id IS NULL THEN
  SELECT * INTO v_period FROM hub_engagement_periods WHERE organization_id=p_org AND creation_key=p_key;
  IF FOUND THEN
   IF v_period.created_by<>p_actor THEN RETURN jsonb_build_object('code','conflict'); END IF;
   RETURN jsonb_build_object('id',v_period.id);
  END IF;
  INSERT INTO hub_engagement_periods(organization_id,name,start_date,end_date,timezone,created_by,creation_key)
  VALUES(p_org,p_payload->>'name',(p_payload->>'startDate')::date,(p_payload->>'endDate')::date,v_zone,p_actor,p_key) RETURNING id INTO v_id;
 ELSE
  SELECT * INTO v_period FROM hub_engagement_periods WHERE organization_id=p_org AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
  IF v_period.closed_at IS NOT NULL THEN
   IF p_payload->>'action'='close' THEN RETURN jsonb_build_object('id',v_period.id); END IF;
   RETURN jsonb_build_object('code','period_closed');
  END IF;
  IF v_period.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RETURN jsonb_build_object('code','conflict'); END IF;
  IF p_payload->>'action'='close' THEN
   -- Group identities, member names, membership and metrics use the same statement snapshot.
   WITH saved_members AS (
    INSERT INTO hub_period_members(organization_id,period_id,person_id,name,archived,person_created_at,points,present,absent,excused,unmarked,group_ids)
    SELECT p_org,p_id,r.* FROM hub_period_live_members(p_org,v_period.start_date,v_period.end_date,v_period.timezone) r RETURNING person_id
   ), saved_groups AS (
    INSERT INTO hub_period_groups(organization_id,period_id,group_id,name,archived,group_created_at)
    SELECT p_org,p_id,id,name,archived,created_at FROM hub_groups WHERE organization_id=p_org RETURNING group_id
   ) UPDATE hub_engagement_periods SET closed_at=clock_timestamp(),closed_by=p_actor,version=version+1 WHERE id=p_id;
  ELSIF p_payload->>'action'='edit' THEN
   UPDATE hub_engagement_periods SET name=p_payload->>'name',start_date=(p_payload->>'startDate')::date,end_date=(p_payload->>'endDate')::date,version=version+1 WHERE id=p_id;
  ELSE RETURN jsonb_build_object('code','invalid_input'); END IF;
  v_id := p_id;
 END IF;
 INSERT INTO hub_directory_audit(organization_id,actor_id,action,entity_id) VALUES(p_org,p_actor,'period.'||coalesce(p_payload->>'action','create'),v_id::text);
 RETURN jsonb_build_object('id',v_id);
EXCEPTION WHEN check_violation OR not_null_violation OR invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
 RETURN jsonb_build_object('code','invalid_input');
END;
$$;
--> statement-breakpoint
CREATE FUNCTION hub_period_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Period snapshots are immutable'; END; $$;
--> statement-breakpoint
CREATE TRIGGER hub_period_members_immutable BEFORE UPDATE OR DELETE ON hub_period_members FOR EACH ROW EXECUTE FUNCTION hub_period_immutable();
--> statement-breakpoint
CREATE TRIGGER hub_period_groups_immutable BEFORE UPDATE OR DELETE ON hub_period_groups FOR EACH ROW EXECUTE FUNCTION hub_period_immutable();
--> statement-breakpoint
CREATE FUNCTION hub_closed_period_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF OLD.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Closed period is immutable'; END IF; RETURN NEW; END; $$;
--> statement-breakpoint
CREATE TRIGGER hub_closed_period_guard BEFORE UPDATE OR DELETE ON hub_engagement_periods FOR EACH ROW EXECUTE FUNCTION hub_closed_period_guard();

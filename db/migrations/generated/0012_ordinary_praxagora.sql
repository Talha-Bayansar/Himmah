CREATE TABLE "hub_challenge_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"challenge_id" uuid NOT NULL,
	"submission_id" uuid,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub_challenge_groups" (
	"organization_id" uuid NOT NULL,
	"challenge_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "hub_challenge_groups_organization_id_challenge_id_group_id_pk" PRIMARY KEY("organization_id","challenge_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "hub_challenge_requests" (
	"organization_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_challenge_requests_organization_id_request_key_pk" PRIMARY KEY("organization_id","request_key")
);
--> statement-breakpoint
CREATE TABLE "hub_challenge_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"challenge_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"challenge_name" text NOT NULL,
	"person_name" text NOT NULL,
	"points" integer NOT NULL,
	"challenge_version" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_by" text NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"feedback" text DEFAULT '' NOT NULL,
	"entry_id" uuid,
	CONSTRAINT "hub_challenge_submission_scope" UNIQUE("organization_id","challenge_id","id"),
	CONSTRAINT "hub_challenge_once" UNIQUE("organization_id","challenge_id","person_id"),
	CONSTRAINT "hub_challenge_submission_fields" CHECK ("hub_challenge_submissions"."status" in ('pending','approved','rejected','withdrawn') and "hub_challenge_submissions"."version">0 and "hub_challenge_submissions"."points" between 1 and 10000 and "hub_challenge_submissions"."challenge_version">0 and length("hub_challenge_submissions"."note")<=500 and length("hub_challenge_submissions"."feedback")<=300 and ("hub_challenge_submissions"."status"='approved')=("hub_challenge_submissions"."entry_id" is not null) and ("hub_challenge_submissions"."status" in ('approved','rejected'))=("hub_challenge_submissions"."reviewed_at" is not null and "hub_challenge_submissions"."reviewed_by" is not null))
);
--> statement-breakpoint
CREATE TABLE "hub_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"points" integer NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_challenge_scope" UNIQUE("organization_id","id"),
	CONSTRAINT "hub_challenge_fields" CHECK (length(trim("hub_challenges"."name")) between 2 and 80 and length(trim("hub_challenges"."description")) between 1 and 2000 and "hub_challenges"."points" between 1 and 10000 and "hub_challenges"."version">0 and "hub_challenges"."status" in ('draft','published','archived')),
	CONSTRAINT "hub_challenge_dates" CHECK (("hub_challenges"."starts_at" is null or "hub_challenges"."starts_at" between '2000-01-01' and '2101-01-01') and ("hub_challenges"."ends_at" is null or "hub_challenges"."ends_at" between '2000-01-01' and '2101-01-01') and ("hub_challenges"."starts_at" is null or "hub_challenges"."ends_at" is null or "hub_challenges"."ends_at">"hub_challenges"."starts_at"))
);
--> statement-breakpoint
ALTER TABLE "hub_points_entries" DROP CONSTRAINT "hub_points_source";--> statement-breakpoint
ALTER TABLE "hub_challenge_events" ADD CONSTRAINT "hub_challenge_events_organization_id_challenge_id_hub_challenges_organization_id_id_fk" FOREIGN KEY ("organization_id","challenge_id") REFERENCES "public"."hub_challenges"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_challenge_events" ADD CONSTRAINT "hub_challenge_events_organization_id_challenge_id_submission_id_hub_challenge_submissions_organization_id_challenge_id_id_fk" FOREIGN KEY ("organization_id","challenge_id","submission_id") REFERENCES "public"."hub_challenge_submissions"("organization_id","challenge_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_challenge_groups" ADD CONSTRAINT "hub_challenge_groups_organization_id_challenge_id_hub_challenges_organization_id_id_fk" FOREIGN KEY ("organization_id","challenge_id") REFERENCES "public"."hub_challenges"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_challenge_groups" ADD CONSTRAINT "hub_challenge_groups_organization_id_group_id_hub_groups_organization_id_id_fk" FOREIGN KEY ("organization_id","group_id") REFERENCES "public"."hub_groups"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_challenge_requests" ADD CONSTRAINT "hub_challenge_requests_organization_id_hub_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."hub_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_challenge_submissions" ADD CONSTRAINT "hub_challenge_submissions_organization_id_challenge_id_hub_challenges_organization_id_id_fk" FOREIGN KEY ("organization_id","challenge_id") REFERENCES "public"."hub_challenges"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_challenge_submissions" ADD CONSTRAINT "hub_challenge_submissions_organization_id_person_id_hub_people_organization_id_id_fk" FOREIGN KEY ("organization_id","person_id") REFERENCES "public"."hub_people"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_challenge_submissions" ADD CONSTRAINT "hub_challenge_submissions_organization_id_person_id_entry_id_hub_points_entries_organization_id_person_id_id_fk" FOREIGN KEY ("organization_id","person_id","entry_id") REFERENCES "public"."hub_points_entries"("organization_id","person_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_challenges" ADD CONSTRAINT "hub_challenges_organization_id_hub_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."hub_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hub_challenge_submission_page" ON "hub_challenge_submissions" USING btree ("organization_id","challenge_id","created_at","id");--> statement-breakpoint
CREATE INDEX "hub_challenge_person_page" ON "hub_challenge_submissions" USING btree ("organization_id","person_id","created_at","id");--> statement-breakpoint
CREATE INDEX "hub_challenge_page" ON "hub_challenges" USING btree ("organization_id","status","created_at","id");--> statement-breakpoint
ALTER TABLE "hub_points_entries" ADD CONSTRAINT "hub_points_source" CHECK ("hub_points_entries"."source" in ('manual','attendance','challenge') and ("hub_points_entries"."source"='manual' or ("hub_points_entries"."rule_version" is not null and "hub_points_entries"."rule_version">0)) and ("hub_points_entries"."source"<>'attendance' or "hub_points_entries"."session_id" is not null));
--> statement-breakpoint
CREATE FUNCTION hub_challenge_eligible(p_org uuid,p_challenge uuid,p_person uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS(SELECT 1 FROM hub_people p WHERE p.organization_id=p_org AND p.id=p_person AND NOT p.archived AND (NOT EXISTS(SELECT 1 FROM hub_challenge_groups WHERE organization_id=p_org AND challenge_id=p_challenge) OR EXISTS(SELECT 1 FROM hub_challenge_groups cg JOIN hub_groups g ON g.organization_id=cg.organization_id AND g.id=cg.group_id AND NOT g.archived JOIN hub_group_people gp ON gp.organization_id=cg.organization_id AND gp.group_id=cg.group_id AND gp.person_id=p_person WHERE cg.organization_id=p_org AND cg.challenge_id=p_challenge)));
$$;
--> statement-breakpoint
CREATE FUNCTION hub_challenge_receipt(p_actor text,p_org uuid,p_key uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r hub_challenge_requests%ROWTYPE;
BEGIN
 IF p_key IS NULL THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 SELECT * INTO r FROM hub_challenge_requests WHERE organization_id=p_org AND request_key=p_key;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF r.actor_id<>p_actor OR r.payload IS DISTINCT FROM p_payload THEN RETURN jsonb_build_object('code','conflict'); END IF;
 RETURN r.response;
END; $$;
--> statement-breakpoint
CREATE FUNCTION hub_challenge_finish(p_actor text,p_org uuid,p_key uuid,p_payload jsonb,p_id uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb:=jsonb_build_object('id',p_id);
BEGIN
 INSERT INTO hub_challenge_requests(organization_id,request_key,actor_id,payload,response) VALUES(p_org,p_key,p_actor,p_payload,r);
 RETURN r;
END; $$;
--> statement-breakpoint
CREATE FUNCTION hub_save_challenge(p_actor text,p_org uuid,p_id uuid,p_key uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE old hub_challenges%ROWTYPE; n hub_challenges%ROWTYPE;req jsonb:=jsonb_build_object('operation','challenge','id',p_id,'payload',p_payload);r jsonb;ids uuid[];act text:=p_payload->>'action';
BEGIN
 PERFORM 1 FROM hub_organizations WHERE id=p_org FOR NO KEY UPDATE;
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin') FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 r:=hub_challenge_receipt(p_actor,p_org,p_key,req);IF r IS NOT NULL THEN RETURN r; END IF;
 IF p_id IS NOT NULL THEN
  SELECT * INTO old FROM hub_challenges WHERE organization_id=p_org AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
  IF old.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RETURN jsonb_build_object('code','conflict'); END IF;
 END IF;
 IF act IN ('create','edit') THEN
  IF (act='create' AND p_id IS NOT NULL) OR (act='edit' AND (p_id IS NULL OR old.status<>'draft')) THEN RETURN jsonb_build_object('code','conflict'); END IF;
  IF jsonb_typeof(p_payload->'groups') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'groups')>50 THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
  SELECT coalesce(array_agg(value::uuid ORDER BY value::uuid),'{}') INTO ids FROM jsonb_array_elements_text(p_payload->'groups');
  IF cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) OR cardinality(ids)<>(SELECT count(*) FROM hub_groups WHERE organization_id=p_org AND id=ANY(ids) AND NOT archived) THEN RETURN jsonb_build_object('code','not_found'); END IF;
  IF act='create' THEN
   INSERT INTO hub_challenges(organization_id,name,description,points,starts_at,ends_at,created_by) VALUES(p_org,btrim(p_payload->>'name'),btrim(p_payload->>'description'),(p_payload->>'points')::integer,(p_payload->>'startsAt')::timestamptz,(p_payload->>'endsAt')::timestamptz,p_actor) RETURNING * INTO n;
  ELSE
   UPDATE hub_challenges SET name=btrim(p_payload->>'name'),description=btrim(p_payload->>'description'),points=(p_payload->>'points')::integer,starts_at=(p_payload->>'startsAt')::timestamptz,ends_at=(p_payload->>'endsAt')::timestamptz,version=version+1 WHERE id=p_id RETURNING * INTO n;
   DELETE FROM hub_challenge_groups WHERE organization_id=p_org AND challenge_id=p_id;
  END IF;
  INSERT INTO hub_challenge_groups(organization_id,challenge_id,group_id) SELECT p_org,n.id,unnest(ids);
 ELSIF act='publish' AND old.status='draft' THEN
  IF old.ends_at IS NOT NULL AND old.ends_at<=clock_timestamp() THEN RETURN jsonb_build_object('code','challenge_closed'); END IF;
  IF EXISTS(SELECT 1 FROM hub_challenge_groups cg JOIN hub_groups g ON g.organization_id=cg.organization_id AND g.id=cg.group_id WHERE cg.organization_id=p_org AND cg.challenge_id=p_id AND g.archived) THEN RETURN jsonb_build_object('code','not_found'); END IF;
  UPDATE hub_challenges SET status='published',version=version+1 WHERE id=p_id RETURNING * INTO n;
 ELSIF act='archive' AND old.status IN ('draft','published') THEN
  UPDATE hub_challenges SET status='archived',version=version+1 WHERE id=p_id RETURNING * INTO n;
 ELSE RETURN jsonb_build_object('code','conflict'); END IF;
 INSERT INTO hub_challenge_events(organization_id,challenge_id,actor_id,action,before,after) VALUES(p_org,n.id,p_actor,act,CASE WHEN p_id IS NOT NULL THEN to_jsonb(old) ELSE NULL END,jsonb_build_object('challenge',to_jsonb(n),'groups',coalesce(to_jsonb(ids),(SELECT jsonb_agg(group_id) FROM hub_challenge_groups WHERE organization_id=p_org AND challenge_id=n.id),'[]'::jsonb)));
 RETURN hub_challenge_finish(p_actor,p_org,p_key,req,n.id);
EXCEPTION WHEN check_violation OR not_null_violation OR invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN jsonb_build_object('code','invalid_input');
END; $$;
--> statement-breakpoint
CREATE FUNCTION hub_submit_challenge(p_actor text,p_org uuid,p_challenge uuid,p_key uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE c hub_challenges%ROWTYPE;s hub_challenge_submissions%ROWTYPE;n hub_challenge_submissions%ROWTYPE;person uuid;req jsonb:=jsonb_build_object('operation','submit','id',p_challenge,'payload',p_payload);r jsonb;act text:=p_payload->>'action';nickname text;
BEGIN
 PERFORM 1 FROM hub_organizations WHERE id=p_org FOR NO KEY UPDATE;
 person:=hub_participant_person(p_actor,p_org);
 IF person IS NULL THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 PERFORM 1 FROM hub_participant_links WHERE organization_id=p_org AND user_id=p_actor AND person_id=person AND revoked_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 SELECT name INTO nickname FROM hub_people WHERE organization_id=p_org AND id=person AND NOT archived FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 r:=hub_challenge_receipt(p_actor,p_org,p_key,req);IF r IS NOT NULL THEN RETURN r; END IF;
 SELECT * INTO c FROM hub_challenges WHERE organization_id=p_org AND id=p_challenge FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 SELECT * INTO s FROM hub_challenge_submissions WHERE organization_id=p_org AND challenge_id=p_challenge AND person_id=person FOR UPDATE;
 IF act='withdraw' THEN
  IF s.id IS NULL OR s.status<>'pending' OR s.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RETURN jsonb_build_object('code','conflict'); END IF;
  UPDATE hub_challenge_submissions SET status='withdrawn',version=version+1 WHERE id=s.id RETURNING * INTO n;
 ELSIF act='submit' THEN
  IF c.status<>'published' OR (c.starts_at IS NOT NULL AND c.starts_at>clock_timestamp()) OR (c.ends_at IS NOT NULL AND c.ends_at<=clock_timestamp()) THEN RETURN jsonb_build_object('code','challenge_closed'); END IF;
  IF NOT hub_challenge_eligible(p_org,p_challenge,person) THEN RETURN jsonb_build_object('code','forbidden'); END IF;
  IF c.version IS DISTINCT FROM (p_payload->>'challengeVersion')::integer OR (s.id IS NOT NULL AND (s.status IN ('pending','approved') OR s.version IS DISTINCT FROM (p_payload->>'version')::integer)) OR (s.id IS NULL AND (p_payload->>'version') IS NOT NULL) THEN RETURN jsonb_build_object('code','conflict'); END IF;
  IF s.id IS NULL THEN
   INSERT INTO hub_challenge_submissions(organization_id,challenge_id,person_id,challenge_name,person_name,points,challenge_version,note,submitted_by) VALUES(p_org,p_challenge,person,c.name,nickname,c.points,c.version,btrim(p_payload->>'note'),p_actor) RETURNING * INTO n;
  ELSE
   UPDATE hub_challenge_submissions SET status='pending',version=version+1,note=btrim(p_payload->>'note'),submitted_at=clock_timestamp(),submitted_by=p_actor,reviewed_at=NULL,reviewed_by=NULL,feedback='' WHERE id=s.id RETURNING * INTO n;
  END IF;
 ELSE RETURN jsonb_build_object('code','invalid_input'); END IF;
 INSERT INTO hub_challenge_events(organization_id,challenge_id,submission_id,actor_id,action,before,after) VALUES(p_org,p_challenge,n.id,p_actor,act,CASE WHEN s.id IS NOT NULL THEN to_jsonb(s) ELSE NULL END,to_jsonb(n));
 RETURN hub_challenge_finish(p_actor,p_org,p_key,req,n.id);
EXCEPTION WHEN check_violation OR not_null_violation OR invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('code','invalid_input');
END; $$;
--> statement-breakpoint
CREATE FUNCTION hub_review_challenge(p_actor text,p_org uuid,p_challenge uuid,p_submission uuid,p_key uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE c hub_challenges%ROWTYPE;s hub_challenge_submissions%ROWTYPE;n hub_challenge_submissions%ROWTYPE;person uuid;nickname text;req jsonb:=jsonb_build_object('operation','review','id',p_challenge,'submission',p_submission,'payload',p_payload);r jsonb;act text:=p_payload->>'action';entry uuid;point_request uuid;
BEGIN
 PERFORM 1 FROM hub_organizations WHERE id=p_org FOR NO KEY UPDATE;
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin') FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 SELECT * INTO c FROM hub_challenges WHERE organization_id=p_org AND id=p_challenge FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 IF act='record' THEN person:=(p_payload->>'personId')::uuid;
 ELSE SELECT person_id INTO person FROM hub_challenge_submissions WHERE organization_id=p_org AND challenge_id=p_challenge AND id=p_submission; END IF;
 IF person IS NULL THEN RETURN jsonb_build_object('code','not_found'); END IF;
 IF hub_participant_is_self(p_actor,p_org,person) THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 SELECT name INTO nickname FROM hub_people WHERE organization_id=p_org AND id=person FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 r:=hub_challenge_receipt(p_actor,p_org,p_key,req);IF r IS NOT NULL THEN RETURN r; END IF;
 SELECT * INTO s FROM hub_challenge_submissions WHERE organization_id=p_org AND challenge_id=p_challenge AND person_id=person FOR UPDATE;
 IF act='record' THEN
  IF p_submission IS NOT NULL OR c.version IS DISTINCT FROM (p_payload->>'challengeVersion')::integer OR (s.id IS NOT NULL AND (s.status IN ('pending','approved') OR s.version IS DISTINCT FROM (p_payload->>'version')::integer)) OR (s.id IS NULL AND (p_payload->>'version') IS NOT NULL) THEN RETURN jsonb_build_object('code','conflict'); END IF;
  IF c.status<>'published' OR (c.starts_at IS NOT NULL AND c.starts_at>clock_timestamp()) OR (c.ends_at IS NOT NULL AND c.ends_at<=clock_timestamp()) THEN RETURN jsonb_build_object('code','challenge_closed'); END IF;
  IF NOT hub_challenge_eligible(p_org,p_challenge,person) THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 ELSIF act IN ('approve','reject') THEN
  IF s.id IS NULL OR s.id<>p_submission OR s.status<>'pending' OR s.version IS DISTINCT FROM (p_payload->>'version')::integer THEN RETURN jsonb_build_object('code','conflict'); END IF;
 ELSE RETURN jsonb_build_object('code','invalid_input'); END IF;
 IF p_payload->>'feedback' IS NULL OR length(btrim(p_payload->>'feedback'))>300 OR (act IN ('reject','record') AND length(btrim(p_payload->>'feedback'))<1) THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
 IF act<>'reject' THEN
  IF EXISTS(SELECT 1 FROM hub_people WHERE organization_id=p_org AND id=person AND archived) THEN RETURN jsonb_build_object('code','forbidden'); END IF;
  INSERT INTO hub_points_requests(organization_id,request_key,actor_id,payload,response) VALUES(p_org,gen_random_uuid(),p_actor,req,jsonb_build_object('challengeId',p_challenge)) RETURNING id INTO point_request;
  INSERT INTO hub_points_entries(organization_id,person_id,request_id,actor_id,amount,reason,source,rule_version,occurred_at) VALUES(p_org,person,point_request,p_actor,coalesce(s.points,c.points),coalesce(s.challenge_name,c.name),'challenge',coalesce(s.challenge_version,c.version),CASE WHEN act='record' THEN clock_timestamp() ELSE s.submitted_at END) RETURNING id INTO entry;
 END IF;
 IF s.id IS NULL THEN
  INSERT INTO hub_challenge_submissions(organization_id,challenge_id,person_id,challenge_name,person_name,points,challenge_version,note,submitted_by,status,reviewed_at,reviewed_by,feedback,entry_id) VALUES(p_org,p_challenge,person,c.name,nickname,c.points,c.version,'',p_actor,'approved',clock_timestamp(),p_actor,btrim(p_payload->>'feedback'),entry) RETURNING * INTO n;
 ELSE
  UPDATE hub_challenge_submissions SET status=CASE WHEN act='reject' THEN 'rejected' ELSE 'approved' END,version=version+1,reviewed_at=clock_timestamp(),reviewed_by=p_actor,feedback=btrim(p_payload->>'feedback'),entry_id=entry,submitted_by=CASE WHEN act='record' THEN p_actor ELSE submitted_by END,note=CASE WHEN act='record' THEN '' ELSE note END,submitted_at=CASE WHEN act='record' THEN clock_timestamp() ELSE submitted_at END WHERE id=s.id RETURNING * INTO n;
 END IF;
 INSERT INTO hub_challenge_events(organization_id,challenge_id,submission_id,actor_id,action,before,after) VALUES(p_org,p_challenge,n.id,p_actor,act,CASE WHEN s.id IS NOT NULL THEN to_jsonb(s) ELSE NULL END,to_jsonb(n));
 RETURN hub_challenge_finish(p_actor,p_org,p_key,req,n.id);
EXCEPTION WHEN check_violation OR not_null_violation OR invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('code','invalid_input');
END; $$;
--> statement-breakpoint
CREATE FUNCTION hub_challenge_submission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Challenge history is preserved'; END IF;
 IF OLD.status='approved' OR (to_jsonb(NEW)-ARRAY['status','version','note','submitted_at','submitted_by','reviewed_at','reviewed_by','feedback','entry_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','note','submitted_at','submitted_by','reviewed_at','reviewed_by','feedback','entry_id']) OR NEW.version<>OLD.version+1 OR NOT ((OLD.status='pending' AND NEW.status IN ('approved','rejected','withdrawn')) OR (OLD.status IN ('rejected','withdrawn') AND NEW.status IN ('pending','approved'))) THEN RAISE EXCEPTION 'Invalid challenge transition'; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER hub_challenge_submission_guard BEFORE UPDATE OR DELETE ON hub_challenge_submissions FOR EACH ROW EXECUTE FUNCTION hub_challenge_submission_guard();
--> statement-breakpoint
CREATE TRIGGER hub_challenge_events_immutable BEFORE UPDATE OR DELETE ON hub_challenge_events FOR EACH ROW EXECUTE FUNCTION hub_points_immutable();
--> statement-breakpoint
CREATE TRIGGER hub_challenge_requests_immutable BEFORE UPDATE OR DELETE ON hub_challenge_requests FOR EACH ROW EXECUTE FUNCTION hub_points_immutable();
--> statement-breakpoint
CREATE FUNCTION hub_challenge_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Challenge history is preserved'; END IF;
 IF (NEW.id,NEW.organization_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.created_by,OLD.created_at) OR NEW.version<>OLD.version+1 OR (OLD.status<>'draft' AND (OLD.status<>'published' OR NEW.status<>'archived' OR (to_jsonb(NEW)-ARRAY['status','version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version']))) THEN RAISE EXCEPTION 'Published challenge settings are frozen'; END IF;
 RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER hub_challenge_guard BEFORE UPDATE OR DELETE ON hub_challenges FOR EACH ROW EXECUTE FUNCTION hub_challenge_guard();
--> statement-breakpoint
CREATE FUNCTION hub_challenge_group_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE org uuid;cid uuid;
BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Replace draft audience through the challenge transaction'; END IF;
 IF TG_OP='DELETE' THEN org:=OLD.organization_id;cid:=OLD.challenge_id; ELSE org:=NEW.organization_id;cid:=NEW.challenge_id; END IF;
 IF NOT EXISTS(SELECT 1 FROM hub_challenges WHERE organization_id=org AND id=cid AND status='draft') THEN RAISE EXCEPTION 'Published audiences are frozen'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER hub_challenge_group_guard BEFORE INSERT OR UPDATE OR DELETE ON hub_challenge_groups FOR EACH ROW EXECUTE FUNCTION hub_challenge_group_guard();

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
  INSERT INTO hub_points_entries(organization_id,person_id,request_id,actor_id,amount,reason,original_id,activity_id,session_id,occurred_at,source,rule_version)
  VALUES(p_org,v_id,v_request,p_actor,v_delta,v_reason,CASE WHEN v_kind='correct' THEN v_original.id ELSE NULL END,CASE WHEN v_kind='correct' THEN v_original.activity_id ELSE v_activity END,CASE WHEN v_kind='correct' THEN v_original.session_id ELSE v_session END,v_date,CASE WHEN v_kind='correct' THEN v_original.source ELSE 'manual' END,CASE WHEN v_kind='correct' THEN v_original.rule_version ELSE NULL END);
  v_results := v_results || jsonb_build_array(jsonb_build_object('personId',v_id,'name',v_person.name,'outcome','saved'));
 END LOOP;
 UPDATE hub_points_requests SET response=jsonb_build_object('items',v_results) WHERE id=v_request;
 RETURN jsonb_build_object('items',v_results);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN
 RETURN jsonb_build_object('code','invalid_input');
END;
$$;

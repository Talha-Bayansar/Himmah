-- Pilot app-access policy: owner/admin setup only. Billing does not gate standalone Hub.
CREATE FUNCTION futsal_rules_valid(s jsonb) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE spec text; k text; low integer; high integer; n integer; zone text; prep timestamptz; first_at timestamptz; last_at timestamptz; rounds integer;
BEGIN
 IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR s->>'schemaVersion' IS DISTINCT FROM '1' OR NOT coalesce(s->>'mode' IN ('club_manager','team_league'),false) OR NOT coalesce(s->>'format' IN ('league','tournament'),false) OR NOT coalesce(s->>'drawPolicy' IN ('entry_order','seeded_draw'),false) OR jsonb_typeof(s->'trainingBetweenRounds') IS DISTINCT FROM 'boolean' THEN RETURN false; END IF;
 FOREACH spec IN ARRAY ARRAY['entryCount:2:16','playersPerTeam:1:5','squadSize:5:7','startingRating:30:70','ratingCeiling:31:99','trainingEveryDays:1:14','roundEveryDays:1:14','baseGrowth:1:2','bonusGrowth:1:2','maxGrowth:2:3','pointsPerStep:1:1000','chanceStep:1:10','chanceCap:5:40','legs:1:2','winPoints:1:5','drawPoints:0:3','lossPoints:0:1'] LOOP
  k:=split_part(spec,':',1);low:=split_part(spec,':',2)::int;high:=split_part(spec,':',3)::int;
  IF jsonb_typeof(s->k) IS DISTINCT FROM 'number' OR NOT coalesce(s->>k ~ '^\d+$',false) THEN RETURN false; END IF;
  n:=(s->>k)::int;IF n<low OR n>high THEN RETURN false; END IF;
 END LOOP;
 IF s->>'mode'='club_manager' THEN
  IF (s->>'playersPerTeam')::int<>1 OR (s->>'squadSize')::int NOT IN (5,7) THEN RETURN false; END IF;
 ELSIF (s->>'playersPerTeam')::int<2 OR (s->>'squadSize')::int<>5 THEN RETURN false;
 END IF;
 IF (s->>'startingRating')::int>=(s->>'ratingCeiling')::int OR (s->>'baseGrowth')::int+(s->>'bonusGrowth')::int>(s->>'maxGrowth')::int OR (s->>'chanceStep')::int>(s->>'chanceCap')::int OR (s->>'winPoints')::int<=(s->>'drawPoints')::int OR (s->>'drawPoints')::int<(s->>'lossPoints')::int THEN RETURN false; END IF;
 zone:=s->>'timezone';IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone) THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['preparationStartsAt','startsAt','endsAt'] LOOP
  IF jsonb_typeof(s->k) IS DISTINCT FROM 'string' OR NOT coalesce(s->>k ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$',false) THEN RETURN false; END IF;
 END LOOP;
 prep:=(s->>'preparationStartsAt')::timestamptz;first_at:=(s->>'startsAt')::timestamptz;last_at:=(s->>'endsAt')::timestamptz;
 IF prep>=first_at OR first_at>=last_at OR last_at-prep>interval '180 days' OR ((first_at AT TIME ZONE zone)-interval '1 hour') AT TIME ZONE zone<prep THEN RETURN false; END IF;
 n:=(s->>'entryCount')::int;
 rounds:=CASE WHEN s->>'format'='league' THEN (CASE WHEN n%2=0 THEN n-1 ELSE n END)*(s->>'legs')::int ELSE ceil(log(2,n::numeric))::int END;
 IF ((first_at AT TIME ZONE zone)+(rounds-1)*(s->>'roundEveryDays')::int*interval '1 day') AT TIME ZONE zone>=last_at THEN RETURN false; END IF;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END; $$;

--> statement-breakpoint
CREATE TABLE "futsal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "futsal_entry_scope" UNIQUE("organization_id","season_id","id"),
	CONSTRAINT "futsal_entry_name" CHECK (length(trim("futsal_entries"."name")) between 2 and 80)
);
--> statement-breakpoint
CREATE TABLE "futsal_entry_members" (
	"organization_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	CONSTRAINT "futsal_entry_members_organization_id_season_id_person_id_pk" PRIMARY KEY("organization_id","season_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "futsal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "futsal_requests" (
	"organization_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "futsal_requests_organization_id_request_key_pk" PRIMARY KEY("organization_id","request_key")
);
--> statement-breakpoint
CREATE TABLE "futsal_seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"prize_criteria" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"settings" jsonb NOT NULL,
	"seed" uuid DEFAULT gen_random_uuid() NOT NULL,
	"snapshot" jsonb,
	"prepared_at" timestamp with time zone,
	"prepared_by" text,
	"cancel_reason" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "futsal_season_scope" UNIQUE("organization_id","id"),
	CONSTRAINT "futsal_rules_check" CHECK (futsal_rules_valid("futsal_seasons"."settings")),
	CONSTRAINT "futsal_season_fields" CHECK (length(trim("futsal_seasons"."name")) between 2 and 80 and length("futsal_seasons"."description")<=1000 and length("futsal_seasons"."prize_criteria")<=500 and "futsal_seasons"."version">0 and "futsal_seasons"."status" in ('draft','prepared','cancelled') and ("futsal_seasons"."snapshot" is null)=("futsal_seasons"."prepared_at" is null) and ("futsal_seasons"."status"<>'prepared' or "futsal_seasons"."snapshot" is not null) and ("futsal_seasons"."status"<>'draft' or "futsal_seasons"."snapshot" is null) and ("futsal_seasons"."status"<>'cancelled' or ("futsal_seasons"."cancel_reason" is not null and length(trim("futsal_seasons"."cancel_reason")) between 1 and 300)))
);
--> statement-breakpoint
ALTER TABLE "futsal_entries" ADD CONSTRAINT "futsal_entries_organization_id_season_id_futsal_seasons_organization_id_id_fk" FOREIGN KEY ("organization_id","season_id") REFERENCES "public"."futsal_seasons"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "futsal_entry_members" ADD CONSTRAINT "futsal_member_entry_fk" FOREIGN KEY ("organization_id","season_id","entry_id") REFERENCES "public"."futsal_entries"("organization_id","season_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "futsal_entry_members" ADD CONSTRAINT "futsal_entry_members_organization_id_person_id_hub_people_organization_id_id_fk" FOREIGN KEY ("organization_id","person_id") REFERENCES "public"."hub_people"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "futsal_events" ADD CONSTRAINT "futsal_events_organization_id_season_id_futsal_seasons_organization_id_id_fk" FOREIGN KEY ("organization_id","season_id") REFERENCES "public"."futsal_seasons"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "futsal_requests" ADD CONSTRAINT "futsal_requests_organization_id_hub_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."hub_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "futsal_seasons" ADD CONSTRAINT "futsal_seasons_organization_id_hub_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."hub_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "futsal_entry_page" ON "futsal_entries" USING btree ("organization_id","season_id","created_at","id");--> statement-breakpoint
CREATE INDEX "futsal_season_page" ON "futsal_seasons" USING btree ("organization_id","created_at","id");
--> statement-breakpoint

CREATE FUNCTION futsal_command(p_actor text,p_org uuid,p_id uuid,p_entry uuid,p_key uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE old futsal_seasons%ROWTYPE;n futsal_seasons%ROWTYPE;existing futsal_requests%ROWTYPE;entry futsal_entries%ROWTYPE;op text:=p_payload->>'operation';request jsonb:=jsonb_build_object('season',p_id,'entry',p_entry,'payload',p_payload);r jsonb;ids uuid[];person uuid;expected integer;entry_count integer;roster jsonb;zone text;
BEGIN
 SELECT timezone INTO zone FROM hub_organizations WHERE id=p_org FOR NO KEY UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
 PERFORM 1 FROM hub_memberships WHERE organization_id=p_org AND user_id=p_actor AND role IN ('owner','admin') FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('code','forbidden'); END IF;
 SELECT * INTO existing FROM futsal_requests WHERE organization_id=p_org AND request_key=p_key;
 IF FOUND THEN
  IF existing.actor_id<>p_actor OR existing.payload<>request THEN RETURN jsonb_build_object('code','conflict'); END IF;
  RETURN existing.response;
 END IF;
 IF p_id IS NULL THEN
  IF op IS DISTINCT FROM 'save' OR p_entry IS NOT NULL OR NOT futsal_rules_valid(p_payload->'settings') OR p_payload->'settings'->>'timezone' IS DISTINCT FROM zone THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
  INSERT INTO futsal_seasons(organization_id,name,description,prize_criteria,settings,created_by) VALUES(p_org,btrim(p_payload->>'name'),p_payload->>'description',p_payload->>'prizeCriteria',p_payload->'settings',p_actor) RETURNING * INTO n;
 ELSE
  SELECT * INTO old FROM futsal_seasons WHERE organization_id=p_org AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
  IF old.version IS DISTINCT FROM (p_payload->>'version')::int THEN RETURN jsonb_build_object('code','conflict'); END IF;
  IF old.status='cancelled' OR (old.status='prepared' AND op<>'cancel') THEN RETURN jsonb_build_object('code','futsal_locked'); END IF;
  IF op='save' THEN
   IF p_entry IS NOT NULL OR NOT futsal_rules_valid(p_payload->'settings') OR p_payload->'settings'->>'timezone' IS DISTINCT FROM old.settings->>'timezone' THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
   IF EXISTS(SELECT 1 FROM futsal_entries e WHERE e.organization_id=p_org AND e.season_id=p_id AND (SELECT count(*) FROM futsal_entry_members m WHERE m.organization_id=p_org AND m.season_id=p_id AND m.entry_id=e.id)<>(p_payload->'settings'->>'playersPerTeam')::int) OR (SELECT count(*) FROM futsal_entries WHERE organization_id=p_org AND season_id=p_id)>(p_payload->'settings'->>'entryCount')::int THEN RETURN jsonb_build_object('code','futsal_roster_change'); END IF;
   UPDATE futsal_seasons SET name=btrim(p_payload->>'name'),description=p_payload->>'description',prize_criteria=p_payload->>'prizeCriteria',settings=p_payload->'settings',version=version+1 WHERE organization_id=p_org AND id=p_id RETURNING * INTO n;
  ELSIF op IN ('entry','remove_entry') THEN
   IF p_entry IS NOT NULL THEN
    SELECT * INTO entry FROM futsal_entries WHERE organization_id=p_org AND season_id=p_id AND id=p_entry FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('code','not_found'); END IF;
   END IF;
   IF op='remove_entry' THEN
    IF p_entry IS NULL THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
    DELETE FROM futsal_entries WHERE organization_id=p_org AND season_id=p_id AND id=p_entry;
   ELSE
    IF jsonb_typeof(p_payload->'members') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'members')<>(old.settings->>'playersPerTeam')::int THEN RETURN jsonb_build_object('code','futsal_roster'); END IF;
    SELECT array_agg(value::uuid ORDER BY value) INTO ids FROM jsonb_array_elements_text(p_payload->'members');
    IF (SELECT count(DISTINCT i) FROM unnest(ids)i)<>cardinality(ids) THEN RETURN jsonb_build_object('code','futsal_roster'); END IF;
    FOREACH person IN ARRAY ids LOOP
     PERFORM 1 FROM hub_people WHERE organization_id=p_org AND id=person AND NOT archived FOR UPDATE;
     IF NOT FOUND THEN RETURN jsonb_build_object('code','futsal_member'); END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM futsal_entry_members WHERE organization_id=p_org AND season_id=p_id AND person_id=ANY(ids) AND (p_entry IS NULL OR entry_id<>p_entry)) THEN RETURN jsonb_build_object('code','futsal_assigned'); END IF;
    IF p_entry IS NULL THEN
     SELECT count(*) INTO entry_count FROM futsal_entries WHERE organization_id=p_org AND season_id=p_id;
     IF entry_count>=(old.settings->>'entryCount')::int THEN RETURN jsonb_build_object('code','futsal_entries'); END IF;
     INSERT INTO futsal_entries(organization_id,season_id,name) VALUES(p_org,p_id,btrim(p_payload->>'name')) RETURNING * INTO entry;
    ELSE
     UPDATE futsal_entries SET name=btrim(p_payload->>'name') WHERE organization_id=p_org AND season_id=p_id AND id=p_entry RETURNING * INTO entry;
     DELETE FROM futsal_entry_members WHERE organization_id=p_org AND season_id=p_id AND entry_id=p_entry;
    END IF;
    INSERT INTO futsal_entry_members(organization_id,season_id,entry_id,person_id) SELECT p_org,p_id,entry.id,i FROM unnest(ids)i;
   END IF;
   UPDATE futsal_seasons SET version=version+1 WHERE organization_id=p_org AND id=p_id RETURNING * INTO n;
  ELSIF op='prepare' THEN
   IF p_entry IS NOT NULL OR (old.settings->>'preparationStartsAt')::timestamptz<=clock_timestamp() THEN RETURN jsonb_build_object('code','futsal_future'); END IF;
   SELECT count(*) INTO entry_count FROM futsal_entries WHERE organization_id=p_org AND season_id=p_id;
   IF entry_count<>(old.settings->>'entryCount')::int OR EXISTS(SELECT 1 FROM futsal_entries e WHERE e.organization_id=p_org AND e.season_id=p_id AND (SELECT count(*) FROM futsal_entry_members m WHERE m.organization_id=p_org AND m.season_id=p_id AND m.entry_id=e.id)<>(old.settings->>'playersPerTeam')::int) THEN RETURN jsonb_build_object('code','futsal_entries'); END IF;
   IF EXISTS(SELECT 1 FROM futsal_entry_members m JOIN hub_people p ON p.organization_id=m.organization_id AND p.id=m.person_id WHERE m.organization_id=p_org AND m.season_id=p_id AND p.archived) THEN RETURN jsonb_build_object('code','futsal_member'); END IF;
   IF p_payload->'plan'->>'rulesVersion' IS DISTINCT FROM 'futsal-setup-v1' OR jsonb_typeof(p_payload->'plan'->'rounds') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'plan'->'rounds') NOT BETWEEN 1 AND 30 OR jsonb_typeof(p_payload->'plan'->'trainingAt') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'plan'->'trainingAt') NOT BETWEEN 1 AND 128 THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
   SELECT jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'createdAt',e.created_at,'members',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'archived',false) ORDER BY p.id) FROM futsal_entry_members m JOIN hub_people p ON p.organization_id=m.organization_id AND p.id=m.person_id WHERE m.organization_id=p_org AND m.season_id=p_id AND m.entry_id=e.id)) ORDER BY e.created_at,e.id) INTO roster FROM futsal_entries e WHERE e.organization_id=p_org AND e.season_id=p_id;
   UPDATE futsal_seasons SET status='prepared',version=version+1,prepared_at=clock_timestamp(),prepared_by=p_actor,snapshot=jsonb_build_object('rulesVersion','futsal-setup-v1','settings',old.settings,'seed',old.seed,'entries',roster,'plan',p_payload->'plan') WHERE organization_id=p_org AND id=p_id RETURNING * INTO n;
  ELSIF op='cancel' THEN
   IF length(btrim(p_payload->>'reason')) NOT BETWEEN 1 AND 300 OR p_payload->>'reason' IS NULL THEN RETURN jsonb_build_object('code','invalid_input'); END IF;
   UPDATE futsal_seasons SET status='cancelled',version=version+1,cancel_reason=btrim(p_payload->>'reason') WHERE organization_id=p_org AND id=p_id RETURNING * INTO n;
  ELSE RETURN jsonb_build_object('code','invalid_input'); END IF;
 END IF;
 INSERT INTO futsal_events(organization_id,season_id,actor_id,action,before,after) VALUES(p_org,n.id,p_actor,op,CASE WHEN old.id IS NOT NULL THEN to_jsonb(old) ELSE NULL END,jsonb_build_object('season',to_jsonb(n),'entry',CASE WHEN entry.id IS NOT NULL THEN to_jsonb(entry) ELSE NULL END,'request',p_payload));
 r:=jsonb_build_object('id',n.id,'entryId',entry.id);
 INSERT INTO futsal_requests(organization_id,request_key,actor_id,payload,response) VALUES(p_org,p_key,p_actor,request,r);
 RETURN r;
EXCEPTION WHEN check_violation OR not_null_violation OR invalid_text_representation OR numeric_value_out_of_range OR unique_violation OR foreign_key_violation THEN RETURN jsonb_build_object('code','invalid_input');
END; $$;
--> statement-breakpoint
CREATE FUNCTION futsal_frozen_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE state text;org uuid;season uuid;
BEGIN
 IF TG_TABLE_NAME='futsal_seasons' THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Seasons must be cancelled, not deleted'; END IF;
  IF (NEW.organization_id,NEW.id,NEW.seed,NEW.created_at,NEW.created_by) IS DISTINCT FROM (OLD.organization_id,OLD.id,OLD.seed,OLD.created_at,OLD.created_by) OR NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Season identity/version is immutable'; END IF;
  IF OLD.status='cancelled' OR (OLD.status='prepared' AND (NEW.status NOT IN ('prepared','cancelled') OR (NEW.settings,NEW.name,NEW.description,NEW.prize_criteria,NEW.snapshot,NEW.prepared_at,NEW.prepared_by) IS DISTINCT FROM (OLD.settings,OLD.name,OLD.description,OLD.prize_criteria,OLD.snapshot,OLD.prepared_at,OLD.prepared_by))) THEN RAISE EXCEPTION 'Locked season setup is immutable'; END IF;
 ELSE
  IF TG_OP='DELETE' THEN org:=OLD.organization_id;season:=OLD.season_id;
  ELSE org:=NEW.organization_id;season:=NEW.season_id;
   IF TG_OP='UPDATE' AND (NEW.organization_id,NEW.season_id) IS DISTINCT FROM (OLD.organization_id,OLD.season_id) THEN RAISE EXCEPTION 'Entry scope is immutable'; END IF;
  END IF;
  SELECT status INTO state FROM futsal_seasons WHERE organization_id=org AND id=season FOR NO KEY UPDATE;
  IF state IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Locked entrants are immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END; $$;
--> statement-breakpoint
CREATE TRIGGER futsal_seasons_guard BEFORE UPDATE OR DELETE ON futsal_seasons FOR EACH ROW EXECUTE FUNCTION futsal_frozen_guard();
--> statement-breakpoint
CREATE TRIGGER futsal_entries_guard BEFORE INSERT OR UPDATE OR DELETE ON futsal_entries FOR EACH ROW EXECUTE FUNCTION futsal_frozen_guard();
--> statement-breakpoint
CREATE TRIGGER futsal_members_guard BEFORE INSERT OR UPDATE OR DELETE ON futsal_entry_members FOR EACH ROW EXECUTE FUNCTION futsal_frozen_guard();
--> statement-breakpoint
CREATE FUNCTION futsal_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Futsal audit and receipts are immutable'; END; $$;
--> statement-breakpoint
CREATE TRIGGER futsal_events_immutable BEFORE UPDATE OR DELETE ON futsal_events FOR EACH ROW EXECUTE FUNCTION futsal_audit_immutable();
--> statement-breakpoint
CREATE TRIGGER futsal_requests_immutable BEFORE UPDATE OR DELETE ON futsal_requests FOR EACH ROW EXECUTE FUNCTION futsal_audit_immutable();

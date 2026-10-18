CREATE TABLE "hub_activity_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"location" text NOT NULL,
	"timezone" text NOT NULL,
	"audience_group_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"cancellation_reason" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"creation_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_session_scope" UNIQUE("organization_id","activity_id","id"),
	CONSTRAINT "hub_session_creation" UNIQUE("organization_id","activity_id","creation_key"),
	CONSTRAINT "hub_session_time" CHECK ("hub_activity_sessions"."ends_at" > "hub_activity_sessions"."starts_at" and "hub_activity_sessions"."ends_at" <= "hub_activity_sessions"."starts_at" + interval '7 days'),
	CONSTRAINT "hub_session_audience_bound" CHECK (cardinality("hub_activity_sessions"."audience_group_ids") <= 20),
	CONSTRAINT "hub_session_reason" CHECK (length("hub_activity_sessions"."cancellation_reason") <= 300),
	CONSTRAINT "hub_session_location" CHECK (length("hub_activity_sessions"."location") <= 160),
	CONSTRAINT "hub_session_version" CHECK ("hub_activity_sessions"."version">0)
);
--> statement-breakpoint
ALTER TABLE "hub_activities" ALTER COLUMN "starts_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "hub_activities" ALTER COLUMN "ends_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "hub_activities" ADD COLUMN "audience_group_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "hub_activity_sessions" ADD CONSTRAINT "hub_activity_sessions_organization_id_activity_id_hub_activities_organization_id_id_fk" FOREIGN KEY ("organization_id","activity_id") REFERENCES "public"."hub_activities"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hub_session_schedule" ON "hub_activity_sessions" USING btree ("organization_id","activity_id","starts_at","id");--> statement-breakpoint
ALTER TABLE "hub_activities" ADD CONSTRAINT "hub_activity_audience_bound" CHECK (cardinality("hub_activities"."audience_group_ids") <= 20);--> statement-breakpoint
-- Preserve every existing one-off occurrence, including cancelled/past records.
INSERT INTO hub_activity_sessions (id,organization_id,activity_id,name,description,location,timezone,starts_at,ends_at,cancelled,created_by,creation_key,created_at)
SELECT id,organization_id,id,name,description,location,timezone,starts_at,ends_at,cancelled,created_by,creation_key,created_at
FROM hub_activities WHERE starts_at IS NOT NULL AND ends_at IS NOT NULL;

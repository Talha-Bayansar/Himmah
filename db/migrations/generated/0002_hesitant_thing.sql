CREATE TABLE "hub_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"creation_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_activity_scope" UNIQUE("organization_id","id"),
	CONSTRAINT "hub_activity_creation" UNIQUE("organization_id","creation_key"),
	CONSTRAINT "hub_activity_name" CHECK (length(trim("hub_activities"."name")) between 2 and 80),
	CONSTRAINT "hub_activity_description" CHECK (length("hub_activities"."description") <= 2000),
	CONSTRAINT "hub_activity_location" CHECK (length("hub_activities"."location") <= 160),
	CONSTRAINT "hub_activity_time" CHECK ("hub_activities"."ends_at" > "hub_activities"."starts_at" and "hub_activities"."ends_at" <= "hub_activities"."starts_at" + interval '7 days'),
	CONSTRAINT "hub_activity_version" CHECK ("hub_activities"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "hub_activities" ADD CONSTRAINT "hub_activities_organization_id_hub_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."hub_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hub_activity_page" ON "hub_activities" USING btree ("organization_id","cancelled","created_at","id");
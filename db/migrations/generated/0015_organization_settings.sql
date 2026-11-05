CREATE TABLE "hub_organization_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"default_language" text NOT NULL,
	"quiet_enabled" boolean DEFAULT true NOT NULL,
	"quiet_start" integer DEFAULT 1320 NOT NULL,
	"quiet_end" integer DEFAULT 480 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "hub_settings_bounds" CHECK (length("hub_organization_settings"."description")<=1000 and length("hub_organization_settings"."email")<=254 and length("hub_organization_settings"."phone")<=64 and "hub_organization_settings"."version">0),
	CONSTRAINT "hub_settings_language" CHECK ("hub_organization_settings"."default_language" in ('en','nl','tr')),
	CONSTRAINT "hub_settings_quiet" CHECK ("hub_organization_settings"."quiet_start" between 0 and 1439 and "hub_organization_settings"."quiet_end" between 0 and 1439 and (not "hub_organization_settings"."quiet_enabled" or "hub_organization_settings"."quiet_start"<>"hub_organization_settings"."quiet_end"))
);
--> statement-breakpoint
CREATE TABLE "hub_organization_settings_requests" (
	"organization_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"request_key" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_organization_settings_requests_organization_id_actor_id_request_key_pk" PRIMARY KEY("organization_id","actor_id","request_key")
);
--> statement-breakpoint
ALTER TABLE "hub_organization_settings" ADD CONSTRAINT "hub_organization_settings_organization_id_hub_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."hub_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_organization_settings_requests" ADD CONSTRAINT "hub_organization_settings_requests_organization_id_hub_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."hub_organizations"("id") ON DELETE no action ON UPDATE no action;
CREATE TABLE "hub_session_expected_contacts" (
	"organization_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"initial" boolean NOT NULL,
	"included" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_session_expected_contacts_organization_id_session_id_person_id_pk" PRIMARY KEY("organization_id","session_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "hub_session_registration_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"person_id" uuid,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"before" jsonb,
	"after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "hub_registration_event_action" CHECK ("hub_session_registration_events"."action" in ('configure','register','cancel','freeze')),
	CONSTRAINT "hub_registration_event_reason" CHECK (length("hub_session_registration_events"."reason")<=300)
);
--> statement-breakpoint
CREATE TABLE "hub_session_registration_requests" (
	"organization_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_session_registration_requests_organization_id_session_id_request_key_pk" PRIMARY KEY("organization_id","session_id","request_key")
);
--> statement-breakpoint
CREATE TABLE "hub_session_registration_settings" (
	"organization_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"mode" text DEFAULT 'open' NOT NULL,
	"capacity" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"frozen_at" timestamp with time zone,
	CONSTRAINT "hub_session_registration_settings_organization_id_session_id_pk" PRIMARY KEY("organization_id","session_id"),
	CONSTRAINT "hub_registration_mode" CHECK ("hub_session_registration_settings"."mode" in ('open','required')),
	CONSTRAINT "hub_registration_capacity" CHECK ("hub_session_registration_settings"."capacity" is null or "hub_session_registration_settings"."capacity" between 1 and 100000),
	CONSTRAINT "hub_registration_policy_version" CHECK ("hub_session_registration_settings"."version">0)
);
--> statement-breakpoint
CREATE TABLE "hub_session_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_registration_contact" UNIQUE("organization_id","session_id","person_id"),
	CONSTRAINT "hub_registration_status" CHECK ("hub_session_registrations"."status" in ('confirmed','cancelled')),
	CONSTRAINT "hub_registration_source" CHECK ("hub_session_registrations"."source" in ('advance','walk_in')),
	CONSTRAINT "hub_registration_version" CHECK ("hub_session_registrations"."version">0)
);
--> statement-breakpoint
ALTER TABLE "hub_session_expected_contacts" ADD CONSTRAINT "hub_session_expected_contacts_organization_id_activity_id_session_id_hub_activity_sessions_organization_id_activity_id_id_fk" FOREIGN KEY ("organization_id","activity_id","session_id") REFERENCES "public"."hub_activity_sessions"("organization_id","activity_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_session_expected_contacts" ADD CONSTRAINT "hub_session_expected_contacts_organization_id_person_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","person_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_session_registration_events" ADD CONSTRAINT "hub_session_registration_events_organization_id_activity_id_session_id_hub_activity_sessions_organization_id_activity_id_id_fk" FOREIGN KEY ("organization_id","activity_id","session_id") REFERENCES "public"."hub_activity_sessions"("organization_id","activity_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_session_registration_events" ADD CONSTRAINT "hub_session_registration_events_organization_id_person_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","person_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_session_registration_requests" ADD CONSTRAINT "hub_session_registration_requests_organization_id_activity_id_session_id_hub_activity_sessions_organization_id_activity_id_id_fk" FOREIGN KEY ("organization_id","activity_id","session_id") REFERENCES "public"."hub_activity_sessions"("organization_id","activity_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_session_registration_settings" ADD CONSTRAINT "hub_session_registration_settings_organization_id_activity_id_session_id_hub_activity_sessions_organization_id_activity_id_id_fk" FOREIGN KEY ("organization_id","activity_id","session_id") REFERENCES "public"."hub_activity_sessions"("organization_id","activity_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_session_registrations" ADD CONSTRAINT "hub_session_registrations_organization_id_activity_id_session_id_hub_activity_sessions_organization_id_activity_id_id_fk" FOREIGN KEY ("organization_id","activity_id","session_id") REFERENCES "public"."hub_activity_sessions"("organization_id","activity_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_session_registrations" ADD CONSTRAINT "hub_session_registrations_organization_id_person_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","person_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hub_expected_page" ON "hub_session_expected_contacts" USING btree ("organization_id","session_id","created_at","person_id");--> statement-breakpoint
CREATE INDEX "hub_registration_event_page" ON "hub_session_registration_events" USING btree ("organization_id","session_id","created_at","id");--> statement-breakpoint
CREATE INDEX "hub_registration_page" ON "hub_session_registrations" USING btree ("organization_id","session_id","status","created_at","id");
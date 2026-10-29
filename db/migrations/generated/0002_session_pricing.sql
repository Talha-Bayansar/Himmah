CREATE TABLE "hub_registration_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"registration_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_charge_registration" UNIQUE("organization_id","registration_id"),
	CONSTRAINT "hub_charge_amount" CHECK ("hub_registration_charges"."amount_minor" between 1 and 100000000),
	CONSTRAINT "hub_charge_currency" CHECK ("hub_registration_charges"."currency"='EUR')
);
--> statement-breakpoint
ALTER TABLE "hub_activities" ADD COLUMN "price_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hub_activity_sessions" ADD COLUMN "price_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hub_session_registrations" ADD CONSTRAINT "hub_registration_scope" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "hub_registration_charges" ADD CONSTRAINT "hub_registration_charges_organization_id_registration_id_hub_session_registrations_organization_id_id_fk" FOREIGN KEY ("organization_id","registration_id") REFERENCES "public"."hub_session_registrations"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_activities" ADD CONSTRAINT "hub_activity_price" CHECK ("hub_activities"."price_minor" between 0 and 100000000);--> statement-breakpoint
ALTER TABLE "hub_activity_sessions" ADD CONSTRAINT "hub_session_price" CHECK ("hub_activity_sessions"."price_minor" between 0 and 100000000);
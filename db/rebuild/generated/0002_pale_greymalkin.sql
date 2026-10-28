CREATE TABLE "himmah"."communication_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subject_contact_id" uuid NOT NULL,
	"responsible_contact_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"priority" integer NOT NULL,
	"channel" text NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"end_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "communication_not_self" CHECK ("himmah"."communication_assignments"."subject_contact_id"<>"himmah"."communication_assignments"."responsible_contact_id"),
	CONSTRAINT "communication_purpose" CHECK ("himmah"."communication_assignments"."purpose" in ('routine','emergency')),
	CONSTRAINT "communication_priority" CHECK ("himmah"."communication_assignments"."priority" between 1 and 99),
	CONSTRAINT "communication_channel" CHECK ("himmah"."communication_assignments"."channel" in ('phone','email','any')),
	CONSTRAINT "communication_interval" CHECK ("himmah"."communication_assignments"."valid_to" is null or "himmah"."communication_assignments"."valid_to">"himmah"."communication_assignments"."valid_from"),
	CONSTRAINT "communication_reason" CHECK ("himmah"."communication_assignments"."end_reason" is null or length(trim("himmah"."communication_assignments"."end_reason")) between 1 and 300)
);
--> statement-breakpoint
CREATE TABLE "himmah"."contact_communication_preferences" (
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"routine_direct_allowed" boolean DEFAULT true NOT NULL,
	"emergency_direct_allowed" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "contact_communication_preferences_organization_id_contact_id_pk" PRIMARY KEY("organization_id","contact_id")
);
--> statement-breakpoint
ALTER TABLE "himmah"."communication_assignments" ADD CONSTRAINT "communication_assignments_organization_id_subject_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","subject_contact_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."communication_assignments" ADD CONSTRAINT "communication_assignments_organization_id_responsible_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","responsible_contact_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."contact_communication_preferences" ADD CONSTRAINT "contact_communication_preferences_organization_id_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "communication_active_pair" ON "himmah"."communication_assignments" USING btree ("organization_id","subject_contact_id","responsible_contact_id","purpose","channel") WHERE "himmah"."communication_assignments"."valid_to" is null;--> statement-breakpoint
CREATE INDEX "communication_routing" ON "himmah"."communication_assignments" USING btree ("organization_id","subject_contact_id","purpose","priority","id");--> statement-breakpoint
CREATE INDEX "communication_responsible" ON "himmah"."communication_assignments" USING btree ("organization_id","responsible_contact_id");
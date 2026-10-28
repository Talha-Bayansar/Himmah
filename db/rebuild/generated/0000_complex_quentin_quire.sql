CREATE SCHEMA "himmah";
--> statement-breakpoint
CREATE TABLE "himmah"."contact_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"normalized_value" text NOT NULL,
	"preferred" boolean DEFAULT false NOT NULL,
	"ended_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "method_kind" CHECK ("himmah"."contact_methods"."kind" in ('phone','email')),
	CONSTRAINT "method_length" CHECK (length("himmah"."contact_methods"."value") between 1 and 254),
	CONSTRAINT "method_format" CHECK (("himmah"."contact_methods"."kind"='email' and "himmah"."contact_methods"."normalized_value" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') or ("himmah"."contact_methods"."kind"='phone' and "himmah"."contact_methods"."normalized_value" ~ '^[+][1-9][0-9]{6,14}$'))
);
--> statement-breakpoint
CREATE TABLE "himmah"."contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"given_name" text,
	"family_name" text,
	"archived_at" timestamp with time zone,
	"archived_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "contact_scope" UNIQUE("organization_id","id"),
	CONSTRAINT "contact_name" CHECK (length(trim("himmah"."contacts"."display_name")) between 1 and 120),
	CONSTRAINT "contact_given_name" CHECK ("himmah"."contacts"."given_name" is null or length(trim("himmah"."contacts"."given_name")) between 1 and 120),
	CONSTRAINT "contact_family_name" CHECK ("himmah"."contacts"."family_name" is null or length(trim("himmah"."contacts"."family_name")) between 1 and 120),
	CONSTRAINT "contact_version" CHECK ("himmah"."contacts"."version">0),
	CONSTRAINT "contact_archive_pair" CHECK (("himmah"."contacts"."archived_at" is null) = ("himmah"."contacts"."archived_by" is null))
);
--> statement-breakpoint
CREATE TABLE "himmah"."people_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"contact_id" uuid NOT NULL,
	"action" text NOT NULL,
	"entity_version" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_fields" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "himmah"."staff_memberships" (
	"organization_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "staff_memberships_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id"),
	CONSTRAINT "staff_role" CHECK ("himmah"."staff_memberships"."role" in ('owner','admin','volunteer'))
);
--> statement-breakpoint
CREATE TABLE "himmah"."organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "organization_name" CHECK (length(trim("himmah"."organizations"."name")) between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "himmah"."operation_receipts" (
	"organization_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"operation" text NOT NULL,
	"request_key" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"contact_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operation_receipts_organization_id_actor_id_operation_request_key_pk" PRIMARY KEY("organization_id","actor_id","operation","request_key")
);
--> statement-breakpoint
ALTER TABLE "himmah"."contact_methods" ADD CONSTRAINT "contact_methods_organization_id_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."contacts" ADD CONSTRAINT "contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "himmah"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."people_audit_events" ADD CONSTRAINT "people_audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "himmah"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."people_audit_events" ADD CONSTRAINT "people_audit_events_organization_id_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."staff_memberships" ADD CONSTRAINT "staff_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "himmah"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."operation_receipts" ADD CONSTRAINT "operation_receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "himmah"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."operation_receipts" ADD CONSTRAINT "operation_receipts_organization_id_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "method_active_value" ON "himmah"."contact_methods" USING btree ("organization_id","contact_id","kind","normalized_value") WHERE "himmah"."contact_methods"."ended_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "method_active_preferred" ON "himmah"."contact_methods" USING btree ("organization_id","contact_id","kind") WHERE "himmah"."contact_methods"."ended_at" is null and "himmah"."contact_methods"."preferred";--> statement-breakpoint
CREATE INDEX "methods_page" ON "himmah"."contact_methods" USING btree ("organization_id","contact_id","created_at","id");--> statement-breakpoint
CREATE INDEX "contacts_page" ON "himmah"."contacts" USING btree ("organization_id","archived_at","created_at","id");--> statement-breakpoint
CREATE INDEX "people_history_page" ON "himmah"."people_audit_events" USING btree ("organization_id","contact_id","occurred_at","id");
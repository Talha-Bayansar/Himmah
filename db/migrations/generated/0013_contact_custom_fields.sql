CREATE TABLE "himmah"."contact_field_receipts" (
	"organization_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"request_key" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_field_receipts_organization_id_actor_id_request_key_pk" PRIMARY KEY("organization_id","actor_id","request_key")
);
--> statement-breakpoint
CREATE TABLE "himmah"."contact_custom_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "contact_field_org_id" UNIQUE("organization_id","id"),
	CONSTRAINT "contact_field_label" CHECK (length(trim("himmah"."contact_custom_fields"."label")) between 1 and 100),
	CONSTRAINT "contact_field_kind" CHECK ("himmah"."contact_custom_fields"."kind" in ('text','number','date','boolean','choice')),
	CONSTRAINT "contact_field_options" CHECK (jsonb_typeof("himmah"."contact_custom_fields"."options")='array' and jsonb_array_length("himmah"."contact_custom_fields"."options")<=30)
);
--> statement-breakpoint
CREATE TABLE "himmah"."contact_custom_values" (
	"organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "contact_custom_values_organization_id_contact_id_pk" PRIMARY KEY("organization_id","contact_id"),
	CONSTRAINT "contact_custom_values_object" CHECK (jsonb_typeof("himmah"."contact_custom_values"."values")='object')
);
--> statement-breakpoint
ALTER TABLE "himmah"."contact_field_receipts" ADD CONSTRAINT "contact_field_receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "himmah"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."contact_custom_fields" ADD CONSTRAINT "contact_custom_fields_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "himmah"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."contact_custom_values" ADD CONSTRAINT "contact_custom_values_organization_id_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_field_active_label" ON "himmah"."contact_custom_fields" USING btree ("organization_id",lower("label")) WHERE "himmah"."contact_custom_fields"."archived_at" is null;
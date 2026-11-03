CREATE TABLE "himmah"."contact_import_receipts" (
	"organization_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"request_key" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_import_receipts_organization_id_actor_id_request_key_pk" PRIMARY KEY("organization_id","actor_id","request_key")
);
--> statement-breakpoint
ALTER TABLE "himmah"."contact_import_receipts" ADD CONSTRAINT "contact_import_receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "himmah"."organizations"("id") ON DELETE no action ON UPDATE no action;
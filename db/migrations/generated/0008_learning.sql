CREATE TABLE "hub_learning_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"score" integer,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_learning_attempt_scope" UNIQUE("organization_id","id"),
	CONSTRAINT "hub_learning_attempt_sequence" UNIQUE("organization_id","recipient_id","sequence"),
	CONSTRAINT "hub_learning_attempt_state" CHECK (("hub_learning_attempts"."submitted_at" is null and "hub_learning_attempts"."score" is null) or ("hub_learning_attempts"."submitted_at" is not null and "hub_learning_attempts"."score">=0))
);
--> statement-breakpoint
CREATE TABLE "hub_learning_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"activity_id" uuid,
	"session_id" uuid,
	"draft" jsonb NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"current_publication" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "hub_learning_item_scope" UNIQUE("organization_id","id"),
	CONSTRAINT "hub_learning_title" CHECK (length(trim("hub_learning_items"."title")) between 2 and 160),
	CONSTRAINT "hub_learning_state" CHECK ("hub_learning_items"."state" in ('draft','published','closed')),
	CONSTRAINT "hub_learning_revision" CHECK ("hub_learning_items"."version">0)
);
--> statement-breakpoint
CREATE TABLE "hub_learning_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"request_key" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_learning_operation_key" UNIQUE("organization_id","actor_id","request_key")
);
--> statement-breakpoint
CREATE TABLE "hub_learning_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"contact_id" uuid,
	"name" text NOT NULL,
	"link_hash" text,
	"guest_hash" text,
	"revoked" boolean DEFAULT false NOT NULL,
	"allowance" integer DEFAULT 1 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_learning_recipient_scope" UNIQUE("organization_id","id"),
	CONSTRAINT "hub_learning_assignment" UNIQUE("organization_id","publication_id","contact_id"),
	CONSTRAINT "hub_learning_allowance" CHECK ("hub_learning_recipients"."allowance" between 1 and 5),
	CONSTRAINT "hub_learning_identity" CHECK (("hub_learning_recipients"."contact_id" is not null and "hub_learning_recipients"."guest_hash" is null) or ("hub_learning_recipients"."contact_id" is null and "hub_learning_recipients"."guest_hash" is not null))
);
--> statement-breakpoint
CREATE TABLE "hub_learning_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"content" jsonb NOT NULL,
	"open_hash" text,
	"released" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_learning_version_scope" UNIQUE("organization_id","id"),
	CONSTRAINT "hub_learning_version_number" UNIQUE("organization_id","item_id","number")
);
--> statement-breakpoint
ALTER TABLE "hub_learning_attempts" ADD CONSTRAINT "hub_learning_attempts_organization_id_recipient_id_hub_learning_recipients_organization_id_id_fk" FOREIGN KEY ("organization_id","recipient_id") REFERENCES "public"."hub_learning_recipients"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_learning_items" ADD CONSTRAINT "hub_learning_items_organization_id_hub_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."hub_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_learning_items" ADD CONSTRAINT "hub_learning_activity" FOREIGN KEY ("organization_id","activity_id") REFERENCES "public"."hub_activities"("organization_id","id") ON DELETE SET NULL ("activity_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_learning_items" ADD CONSTRAINT "hub_learning_session" FOREIGN KEY ("organization_id","activity_id","session_id") REFERENCES "public"."hub_activity_sessions"("organization_id","activity_id","id") ON DELETE SET NULL ("session_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_learning_operations" ADD CONSTRAINT "hub_learning_operations_organization_id_hub_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."hub_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_learning_recipients" ADD CONSTRAINT "hub_learning_recipients_organization_id_publication_id_hub_learning_versions_organization_id_id_fk" FOREIGN KEY ("organization_id","publication_id") REFERENCES "public"."hub_learning_versions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_learning_recipients" ADD CONSTRAINT "hub_learning_recipients_organization_id_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_learning_versions" ADD CONSTRAINT "hub_learning_versions_organization_id_item_id_hub_learning_items_organization_id_id_fk" FOREIGN KEY ("organization_id","item_id") REFERENCES "public"."hub_learning_items"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hub_learning_directory" ON "hub_learning_items" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_learning_link_hash" ON "hub_learning_recipients" USING btree ("link_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_learning_guest_hash" ON "hub_learning_recipients" USING btree ("guest_hash");--> statement-breakpoint
CREATE INDEX "hub_learning_recipient_directory" ON "hub_learning_recipients" USING btree ("organization_id","publication_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_learning_open_hash" ON "hub_learning_versions" USING btree ("open_hash");

ALTER TABLE hub_learning_items ADD CONSTRAINT hub_learning_current_publication FOREIGN KEY (organization_id,current_publication) REFERENCES hub_learning_versions(organization_id,id);

ALTER TABLE hub_learning_items ADD CONSTRAINT hub_learning_session_context CHECK(session_id IS NULL OR activity_id IS NOT NULL);

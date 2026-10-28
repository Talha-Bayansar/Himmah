CREATE TABLE "himmah"."contact_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_contact_id" uuid NOT NULL,
	"target_contact_id" uuid NOT NULL,
	"type_id" uuid NOT NULL,
	"type_version_id" uuid NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"end_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "relationship_not_self" CHECK ("himmah"."contact_relationships"."source_contact_id"<>"himmah"."contact_relationships"."target_contact_id"),
	CONSTRAINT "relationship_interval" CHECK ("himmah"."contact_relationships"."valid_to" is null or "himmah"."contact_relationships"."valid_to">"himmah"."contact_relationships"."valid_from"),
	CONSTRAINT "relationship_end_reason" CHECK ("himmah"."contact_relationships"."end_reason" is null or length(trim("himmah"."contact_relationships"."end_reason")) between 1 and 300)
);
--> statement-breakpoint
CREATE TABLE "himmah"."group_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"contact_id" uuid,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"reason" text,
	"entity_version" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "himmah"."group_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"end_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "membership_interval" CHECK ("himmah"."group_memberships"."valid_to" is null or "himmah"."group_memberships"."valid_to">"himmah"."group_memberships"."valid_from"),
	CONSTRAINT "membership_reason" CHECK ("himmah"."group_memberships"."end_reason" is null or length(trim("himmah"."group_memberships"."end_reason")) between 1 and 300)
);
--> statement-breakpoint
CREATE TABLE "himmah"."group_operation_requests" (
	"organization_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"operation" text NOT NULL,
	"request_key" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"group_id" uuid NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_operation_requests_organization_id_actor_id_operation_request_key_pk" PRIMARY KEY("organization_id","actor_id","operation","request_key")
);
--> statement-breakpoint
CREATE TABLE "himmah"."groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"archived_at" timestamp with time zone,
	"archived_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "group_scope" UNIQUE("organization_id","id"),
	CONSTRAINT "group_name" CHECK (length(trim("himmah"."groups"."name")) between 1 and 100),
	CONSTRAINT "group_description" CHECK ("himmah"."groups"."description" is null or length("himmah"."groups"."description")<=500),
	CONSTRAINT "group_archive_pair" CHECK (("himmah"."groups"."archived_at" is null)=("himmah"."groups"."archived_by" is null)),
	CONSTRAINT "group_version" CHECK ("himmah"."groups"."version">0)
);
--> statement-breakpoint
CREATE TABLE "himmah"."relationship_type_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"type_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"forward_labels" jsonb NOT NULL,
	"inverse_labels" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relationship_version_scope" UNIQUE("organization_id","type_id","id"),
	CONSTRAINT "relationship_revision" UNIQUE("organization_id","type_id","revision"),
	CONSTRAINT "relationship_revision_positive" CHECK ("himmah"."relationship_type_versions"."revision">0)
);
--> statement-breakpoint
CREATE TABLE "himmah"."relationship_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"symmetric" boolean NOT NULL,
	"category" text NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "relationship_type_scope" UNIQUE("organization_id","id"),
	CONSTRAINT "relationship_type_code" UNIQUE("organization_id","code"),
	CONSTRAINT "relationship_code" CHECK ("himmah"."relationship_types"."code" ~ '^[a-z][a-z0-9_]{0,49}$'),
	CONSTRAINT "relationship_category" CHECK ("himmah"."relationship_types"."category" in ('family','other')),
	CONSTRAINT "relationship_type_archive" CHECK (("himmah"."relationship_types"."archived_at" is null)=("himmah"."relationship_types"."archived_by" is null))
);
--> statement-breakpoint
CREATE TABLE "himmah"."relationship_type_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"type_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_version" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "himmah"."relationship_type_requests" (
	"organization_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"operation" text NOT NULL,
	"request_key" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"type_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relationship_type_requests_organization_id_actor_id_operation_request_key_pk" PRIMARY KEY("organization_id","actor_id","operation","request_key")
);
--> statement-breakpoint
ALTER TABLE "himmah"."contact_relationships" ADD CONSTRAINT "contact_relationships_organization_id_source_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","source_contact_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."contact_relationships" ADD CONSTRAINT "contact_relationships_organization_id_target_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","target_contact_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."contact_relationships" ADD CONSTRAINT "contact_relationships_organization_id_type_id_type_version_id_relationship_type_versions_organization_id_type_id_id_fk" FOREIGN KEY ("organization_id","type_id","type_version_id") REFERENCES "himmah"."relationship_type_versions"("organization_id","type_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."group_events" ADD CONSTRAINT "group_events_organization_id_group_id_groups_organization_id_id_fk" FOREIGN KEY ("organization_id","group_id") REFERENCES "himmah"."groups"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."group_events" ADD CONSTRAINT "group_events_organization_id_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."group_memberships" ADD CONSTRAINT "group_memberships_organization_id_group_id_groups_organization_id_id_fk" FOREIGN KEY ("organization_id","group_id") REFERENCES "himmah"."groups"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."group_memberships" ADD CONSTRAINT "group_memberships_organization_id_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."group_operation_requests" ADD CONSTRAINT "group_operation_requests_organization_id_group_id_groups_organization_id_id_fk" FOREIGN KEY ("organization_id","group_id") REFERENCES "himmah"."groups"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."groups" ADD CONSTRAINT "groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "himmah"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."relationship_type_versions" ADD CONSTRAINT "relationship_type_versions_organization_id_type_id_relationship_types_organization_id_id_fk" FOREIGN KEY ("organization_id","type_id") REFERENCES "himmah"."relationship_types"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."relationship_types" ADD CONSTRAINT "relationship_types_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "himmah"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."relationship_type_events" ADD CONSTRAINT "relationship_type_events_organization_id_type_id_relationship_types_organization_id_id_fk" FOREIGN KEY ("organization_id","type_id") REFERENCES "himmah"."relationship_types"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."relationship_type_requests" ADD CONSTRAINT "relationship_type_requests_organization_id_type_id_relationship_types_organization_id_id_fk" FOREIGN KEY ("organization_id","type_id") REFERENCES "himmah"."relationship_types"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "relationship_active_edge" ON "himmah"."contact_relationships" USING btree ("organization_id","type_id","source_contact_id","target_contact_id") WHERE "himmah"."contact_relationships"."valid_to" is null;--> statement-breakpoint
CREATE INDEX "relationship_source_page" ON "himmah"."contact_relationships" USING btree ("organization_id","source_contact_id","created_at","id");--> statement-breakpoint
CREATE INDEX "relationship_target_page" ON "himmah"."contact_relationships" USING btree ("organization_id","target_contact_id","created_at","id");--> statement-breakpoint
CREATE INDEX "group_events_page" ON "himmah"."group_events" USING btree ("organization_id","group_id","occurred_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_active_pair" ON "himmah"."group_memberships" USING btree ("organization_id","group_id","contact_id") WHERE "himmah"."group_memberships"."valid_to" is null;--> statement-breakpoint
CREATE INDEX "memberships_group_page" ON "himmah"."group_memberships" USING btree ("organization_id","group_id","created_at","id");--> statement-breakpoint
CREATE INDEX "memberships_contact_page" ON "himmah"."group_memberships" USING btree ("organization_id","contact_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_active_name" ON "himmah"."groups" USING btree ("organization_id",lower("name")) WHERE "himmah"."groups"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "groups_page" ON "himmah"."groups" USING btree ("organization_id","archived_at","created_at","id");--> statement-breakpoint
CREATE INDEX "relationship_types_page" ON "himmah"."relationship_types" USING btree ("organization_id","archived_at","created_at","id");--> statement-breakpoint
CREATE INDEX "relationship_type_events_page" ON "himmah"."relationship_type_events" USING btree ("organization_id","type_id","occurred_at","id");
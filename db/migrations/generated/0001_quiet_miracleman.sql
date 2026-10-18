CREATE TABLE "hub_directory_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub_group_people" (
	"organization_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_group_people_organization_id_group_id_person_id_pk" PRIMARY KEY("organization_id","group_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "hub_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"creation_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_group_scope" UNIQUE("organization_id","id"),
	CONSTRAINT "hub_group_creation" UNIQUE("organization_id","creation_key"),
	CONSTRAINT "hub_group_name_length" CHECK (length(trim("hub_groups"."name")) between 2 and 80)
);
--> statement-breakpoint
CREATE TABLE "hub_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"creation_key" uuid NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"accepted_by" text,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "hub_invitation_creation" UNIQUE("organization_id","creation_key"),
	CONSTRAINT "hub_invitation_role" CHECK ("hub_invitations"."role" in ('admin','volunteer'))
);
--> statement-breakpoint
CREATE TABLE "hub_people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"creation_key" uuid NOT NULL,
	"consent_recorded_by" text NOT NULL,
	"consent_recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_person_scope" UNIQUE("organization_id","id"),
	CONSTRAINT "hub_person_creation" UNIQUE("organization_id","creation_key"),
	CONSTRAINT "hub_person_name" CHECK (length(trim("hub_people"."name")) between 2 and 80)
);
--> statement-breakpoint
ALTER TABLE "hub_memberships" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "hub_directory_audit" ADD CONSTRAINT "hub_directory_audit_organization_id_hub_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."hub_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_group_people" ADD CONSTRAINT "hub_group_people_organization_id_group_id_hub_groups_organization_id_id_fk" FOREIGN KEY ("organization_id","group_id") REFERENCES "public"."hub_groups"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_group_people" ADD CONSTRAINT "hub_group_people_organization_id_person_id_hub_people_organization_id_id_fk" FOREIGN KEY ("organization_id","person_id") REFERENCES "public"."hub_people"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_groups" ADD CONSTRAINT "hub_groups_organization_id_hub_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."hub_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_invitations" ADD CONSTRAINT "hub_invitations_organization_id_hub_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."hub_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_people" ADD CONSTRAINT "hub_people_organization_id_hub_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."hub_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hub_directory_audit_org" ON "hub_directory_audit" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "hub_group_people_person" ON "hub_group_people" USING btree ("organization_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_group_name" ON "hub_groups" USING btree ("organization_id",lower("name"));--> statement-breakpoint
CREATE INDEX "hub_groups_page" ON "hub_groups" USING btree ("organization_id","archived","created_at","id");--> statement-breakpoint
CREATE INDEX "hub_invitation_page" ON "hub_invitations" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX "hub_people_page" ON "hub_people" USING btree ("organization_id","archived","created_at","id");
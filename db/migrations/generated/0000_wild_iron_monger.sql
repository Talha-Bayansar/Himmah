CREATE TABLE "hub_memberships" (
	"organization_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_memberships_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id"),
	CONSTRAINT "hub_membership_role" CHECK ("hub_memberships"."role" in ('owner','admin','volunteer'))
);
--> statement-breakpoint
CREATE TABLE "hub_organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"timezone" text NOT NULL,
	"created_by" text NOT NULL,
	"creation_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_organizations_slug_unique" UNIQUE("slug"),
	CONSTRAINT "hub_organization_creation" UNIQUE("created_by","creation_key"),
	CONSTRAINT "hub_organization_name_length" CHECK (length("hub_organizations"."name") between 2 and 100),
	CONSTRAINT "hub_organization_slug" CHECK ("hub_organizations"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length("hub_organizations"."slug") between 3 and 48)
);
--> statement-breakpoint
ALTER TABLE "hub_memberships" ADD CONSTRAINT "hub_memberships_organization_id_hub_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."hub_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hub_membership_user" ON "hub_memberships" USING btree ("user_id");
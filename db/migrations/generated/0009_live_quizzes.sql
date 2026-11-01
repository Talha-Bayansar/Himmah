CREATE TABLE "hub_live_answers" (
	"organization_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"question_index" integer NOT NULL,
	"choice" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_live_answers_room_id_player_id_question_index_pk" PRIMARY KEY("room_id","player_id","question_index"),
	CONSTRAINT "hub_live_answer_bounds" CHECK ("hub_live_answers"."question_index" between 0 and 49 and "hub_live_answers"."choice" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "hub_live_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"request_key" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_live_operation_key" UNIQUE("organization_id","actor","request_key")
);
--> statement-breakpoint
CREATE TABLE "hub_live_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"credential_hash" text NOT NULL,
	"nickname" text,
	"number" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_live_player_scope" UNIQUE("organization_id","room_id","id"),
	CONSTRAINT "hub_live_player_credential" UNIQUE("room_id","credential_hash"),
	CONSTRAINT "hub_live_player_number" UNIQUE("room_id","number"),
	CONSTRAINT "hub_live_player_bounds" CHECK ("hub_live_players"."number" between 1 and 200 and "hub_live_players"."revision">0 and ("hub_live_players"."nickname" is null or length(trim("hub_live_players"."nickname")) between 1 and 40) and "hub_live_players"."credential_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "hub_live_rooms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"publication_id" uuid NOT NULL,
	"code" text NOT NULL,
	"state" text DEFAULT 'lobby' NOT NULL,
	"question_index" integer DEFAULT -1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"next_number" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "hub_live_rooms_code_unique" UNIQUE("code"),
	CONSTRAINT "hub_live_room_scope" UNIQUE("organization_id","id"),
	CONSTRAINT "hub_live_room_state" CHECK ("hub_live_rooms"."state" in ('lobby','question','locked','revealed','finished')),
	CONSTRAINT "hub_live_room_bounds" CHECK ("hub_live_rooms"."question_index" between -1 and 49 and "hub_live_rooms"."version">0 and "hub_live_rooms"."next_number" between 0 and 200 and "hub_live_rooms"."expires_at">"hub_live_rooms"."created_at"),
	CONSTRAINT "hub_live_code" CHECK ("hub_live_rooms"."code" ~ '^[A-F0-9]{10}$')
);
--> statement-breakpoint
ALTER TABLE "hub_live_answers" ADD CONSTRAINT "hub_live_answers_organization_id_room_id_player_id_hub_live_players_organization_id_room_id_id_fk" FOREIGN KEY ("organization_id","room_id","player_id") REFERENCES "public"."hub_live_players"("organization_id","room_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_live_operations" ADD CONSTRAINT "hub_live_operations_organization_id_room_id_hub_live_rooms_organization_id_id_fk" FOREIGN KEY ("organization_id","room_id") REFERENCES "public"."hub_live_rooms"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_live_players" ADD CONSTRAINT "hub_live_players_organization_id_room_id_hub_live_rooms_organization_id_id_fk" FOREIGN KEY ("organization_id","room_id") REFERENCES "public"."hub_live_rooms"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_live_rooms" ADD CONSTRAINT "hub_live_rooms_organization_id_item_id_hub_learning_items_organization_id_id_fk" FOREIGN KEY ("organization_id","item_id") REFERENCES "public"."hub_learning_items"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_live_rooms" ADD CONSTRAINT "hub_live_rooms_organization_id_publication_id_hub_learning_versions_organization_id_id_fk" FOREIGN KEY ("organization_id","publication_id") REFERENCES "public"."hub_learning_versions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hub_live_answer_counts" ON "hub_live_answers" USING btree ("room_id","question_index");--> statement-breakpoint
CREATE INDEX "hub_live_player_directory" ON "hub_live_players" USING btree ("organization_id","room_id","created_at","id");--> statement-breakpoint
CREATE INDEX "hub_live_room_directory" ON "hub_live_rooms" USING btree ("organization_id","item_id","created_at","id");
CREATE TABLE "hub_follow_requests" (
	"organization_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"request_key" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"session_id" uuid,
	"payload" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_follow_requests_organization_id_user_id_request_key_pk" PRIMARY KEY("organization_id","user_id","request_key")
);
--> statement-breakpoint
CREATE TABLE "hub_session_follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"activity_id" uuid NOT NULL,
	"session_id" uuid,
	"enabled" boolean NOT NULL,
	"reminder_minutes" integer DEFAULT 60 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_follow_scope" UNIQUE("organization_id","id"),
	CONSTRAINT "hub_follow_settings" CHECK ("hub_session_follows"."reminder_minutes" in (0,60) and "hub_session_follows"."version">0)
);
--> statement-breakpoint
ALTER TABLE "hub_notifications" ADD COLUMN "activity_id" uuid;--> statement-breakpoint
ALTER TABLE "hub_notifications" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "hub_notifications" ADD COLUMN "follow_id" uuid;--> statement-breakpoint
ALTER TABLE "hub_notifications" ADD COLUMN "follow_version" integer;--> statement-breakpoint
ALTER TABLE "hub_notifications" ADD COLUMN "planned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "hub_notifications" ADD COLUMN "session_fingerprint" text;--> statement-breakpoint
ALTER TABLE "hub_follow_requests" ADD CONSTRAINT "hub_follow_requests_organization_id_user_id_hub_memberships_organization_id_user_id_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."hub_memberships"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_follow_requests" ADD CONSTRAINT "hub_follow_requests_organization_id_activity_id_hub_activities_organization_id_id_fk" FOREIGN KEY ("organization_id","activity_id") REFERENCES "public"."hub_activities"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_follow_requests" ADD CONSTRAINT "hub_follow_requests_organization_id_activity_id_session_id_hub_activity_sessions_organization_id_activity_id_id_fk" FOREIGN KEY ("organization_id","activity_id","session_id") REFERENCES "public"."hub_activity_sessions"("organization_id","activity_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_session_follows" ADD CONSTRAINT "hub_session_follows_organization_id_user_id_hub_memberships_organization_id_user_id_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."hub_memberships"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_session_follows" ADD CONSTRAINT "hub_session_follows_organization_id_activity_id_hub_activities_organization_id_id_fk" FOREIGN KEY ("organization_id","activity_id") REFERENCES "public"."hub_activities"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_session_follows" ADD CONSTRAINT "hub_session_follows_organization_id_activity_id_session_id_hub_activity_sessions_organization_id_activity_id_id_fk" FOREIGN KEY ("organization_id","activity_id","session_id") REFERENCES "public"."hub_activity_sessions"("organization_id","activity_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hub_follow_activity" ON "hub_session_follows" USING btree ("organization_id","user_id","activity_id") WHERE "hub_session_follows"."session_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "hub_follow_session" ON "hub_session_follows" USING btree ("organization_id","user_id","activity_id","session_id") WHERE "hub_session_follows"."session_id" is not null;--> statement-breakpoint
CREATE INDEX "hub_follow_lookup" ON "hub_session_follows" USING btree ("organization_id","activity_id","session_id") WHERE "hub_session_follows"."enabled";--> statement-breakpoint
ALTER TABLE "hub_notifications" ADD CONSTRAINT "hub_notifications_organization_id_follow_id_hub_session_follows_organization_id_id_fk" FOREIGN KEY ("organization_id","follow_id") REFERENCES "public"."hub_session_follows"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_notifications" ADD CONSTRAINT "hub_notifications_organization_id_activity_id_session_id_hub_activity_sessions_organization_id_activity_id_id_fk" FOREIGN KEY ("organization_id","activity_id","session_id") REFERENCES "public"."hub_activity_sessions"("organization_id","activity_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hub_session_reminder_window" ON "hub_activity_sessions" USING btree ("starts_at","id") WHERE not "hub_activity_sessions"."cancelled";--> statement-breakpoint
CREATE UNIQUE INDEX "hub_reminder_once" ON "hub_notifications" USING btree ("organization_id","user_id","session_id","planned_at") WHERE "hub_notifications"."kind"='session_reminder';--> statement-breakpoint
ALTER TABLE "hub_notifications" ADD CONSTRAINT "hub_session_notification_fields" CHECK ("hub_notifications"."kind"='staff_notice' or ("hub_notifications"."kind" in ('session_reminder','session_changed','session_cancelled') and "hub_notifications"."activity_id" is not null and "hub_notifications"."session_id" is not null and "hub_notifications"."follow_id" is not null and "hub_notifications"."follow_version" is not null and "hub_notifications"."follow_version">0 and "hub_notifications"."planned_at" is not null and "hub_notifications"."session_fingerprint" is not null));
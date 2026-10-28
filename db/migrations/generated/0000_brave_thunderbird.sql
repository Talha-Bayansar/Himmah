CREATE SCHEMA "himmah";
--> statement-breakpoint
CREATE TABLE "hub_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"audience_group_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"timezone" text NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"creation_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_activity_scope" UNIQUE("organization_id","id"),
	CONSTRAINT "hub_activity_creation" UNIQUE("organization_id","creation_key"),
	CONSTRAINT "hub_activity_name" CHECK (length(trim("hub_activities"."name")) between 2 and 80),
	CONSTRAINT "hub_activity_description" CHECK (length("hub_activities"."description") <= 2000),
	CONSTRAINT "hub_activity_location" CHECK (length("hub_activities"."location") <= 160),
	CONSTRAINT "hub_activity_time" CHECK ("hub_activities"."ends_at" > "hub_activities"."starts_at" and "hub_activities"."ends_at" <= "hub_activities"."starts_at" + interval '7 days'),
	CONSTRAINT "hub_activity_audience_bound" CHECK (cardinality("hub_activities"."audience_group_ids") <= 20),
	CONSTRAINT "hub_activity_version" CHECK ("hub_activities"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "hub_activity_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"location" text NOT NULL,
	"timezone" text NOT NULL,
	"audience_group_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"cancellation_reason" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"creation_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_session_scope" UNIQUE("organization_id","activity_id","id"),
	CONSTRAINT "hub_session_creation" UNIQUE("organization_id","activity_id","creation_key"),
	CONSTRAINT "hub_session_time" CHECK ("hub_activity_sessions"."ends_at" > "hub_activity_sessions"."starts_at" and "hub_activity_sessions"."ends_at" <= "hub_activity_sessions"."starts_at" + interval '7 days'),
	CONSTRAINT "hub_session_audience_bound" CHECK (cardinality("hub_activity_sessions"."audience_group_ids") <= 20),
	CONSTRAINT "hub_session_reason" CHECK (length("hub_activity_sessions"."cancellation_reason") <= 300),
	CONSTRAINT "hub_session_location" CHECK (length("hub_activity_sessions"."location") <= 160),
	CONSTRAINT "hub_session_version" CHECK ("hub_activity_sessions"."version">0)
);
--> statement-breakpoint
CREATE TABLE "hub_attendance" (
	"organization_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"status" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_attendance_organization_id_session_id_person_id_pk" PRIMARY KEY("organization_id","session_id","person_id"),
	CONSTRAINT "hub_attendance_status" CHECK ("hub_attendance"."status" in ('unmarked','present','absent','excused')),
	CONSTRAINT "hub_attendance_version" CHECK ("hub_attendance"."version">0)
);
--> statement-breakpoint
CREATE TABLE "hub_attendance_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"before_status" text NOT NULL,
	"after_status" text NOT NULL,
	"reason" text NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_attendance_change_version" UNIQUE("organization_id","session_id","person_id","version"),
	CONSTRAINT "hub_attendance_change_states" CHECK ("hub_attendance_changes"."before_status" in ('unmarked','present','absent','excused') and "hub_attendance_changes"."after_status" in ('unmarked','present','absent','excused')),
	CONSTRAINT "hub_attendance_change_reason" CHECK (length("hub_attendance_changes"."reason")<=300 and ("hub_attendance_changes"."version"=1 or length(trim("hub_attendance_changes"."reason"))>0))
);
--> statement-breakpoint
CREATE TABLE "hub_attendance_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_attendance_request_key" UNIQUE("organization_id","session_id","request_key"),
	CONSTRAINT "hub_attendance_request_scope" UNIQUE("organization_id","session_id","id")
);
--> statement-breakpoint
CREATE TABLE "hub_directory_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "hub_memberships" (
	"organization_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_memberships_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id"),
	CONSTRAINT "hub_membership_role" CHECK ("hub_memberships"."role" in ('owner','admin','volunteer'))
);
--> statement-breakpoint
CREATE TABLE "hub_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"event_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"href" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_notification_event" UNIQUE("organization_id","user_id","event_id","kind")
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
CREATE TABLE "hub_push_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_push_delivery" UNIQUE("notification_id","device_id"),
	CONSTRAINT "hub_push_state" CHECK ("hub_push_deliveries"."state" in ('pending','sending','sent','dead') and "hub_push_deliveries"."attempts" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "hub_push_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"locale" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_push_devices_endpoint_unique" UNIQUE("endpoint"),
	CONSTRAINT "hub_push_locale" CHECK ("hub_push_devices"."locale" in ('en','nl','tr'))
);
--> statement-breakpoint
CREATE TABLE "hub_volunteer_assignment_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub_volunteer_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"staff_name" text NOT NULL,
	"group_id" uuid,
	"activity_id" uuid,
	"scope_name" text NOT NULL,
	"can_attend" boolean NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"creation_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"revoke_reason" text,
	CONSTRAINT "hub_volunteer_assignment_scope" UNIQUE("organization_id","id"),
	CONSTRAINT "hub_volunteer_assignment_creation" UNIQUE("organization_id","creation_key"),
	CONSTRAINT "hub_volunteer_assignment_target" CHECK (("hub_volunteer_assignments"."group_id" is null) <> ("hub_volunteer_assignments"."activity_id" is null)),
	CONSTRAINT "hub_volunteer_assignment_version" CHECK ("hub_volunteer_assignments"."version">0)
);
--> statement-breakpoint
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
ALTER TABLE "hub_activities" ADD CONSTRAINT "hub_activities_organization_id_hub_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."hub_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_activity_sessions" ADD CONSTRAINT "hub_activity_sessions_organization_id_activity_id_hub_activities_organization_id_id_fk" FOREIGN KEY ("organization_id","activity_id") REFERENCES "public"."hub_activities"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_attendance" ADD CONSTRAINT "hub_attendance_organization_id_activity_id_session_id_hub_activity_sessions_organization_id_activity_id_id_fk" FOREIGN KEY ("organization_id","activity_id","session_id") REFERENCES "public"."hub_activity_sessions"("organization_id","activity_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_attendance" ADD CONSTRAINT "hub_attendance_organization_id_person_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","person_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_attendance_changes" ADD CONSTRAINT "hub_attendance_changes_organization_id_session_id_person_id_hub_attendance_organization_id_session_id_person_id_fk" FOREIGN KEY ("organization_id","session_id","person_id") REFERENCES "public"."hub_attendance"("organization_id","session_id","person_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_attendance_changes" ADD CONSTRAINT "hub_attendance_changes_organization_id_session_id_request_id_hub_attendance_requests_organization_id_session_id_id_fk" FOREIGN KEY ("organization_id","session_id","request_id") REFERENCES "public"."hub_attendance_requests"("organization_id","session_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_attendance_requests" ADD CONSTRAINT "hub_attendance_requests_organization_id_activity_id_session_id_hub_activity_sessions_organization_id_activity_id_id_fk" FOREIGN KEY ("organization_id","activity_id","session_id") REFERENCES "public"."hub_activity_sessions"("organization_id","activity_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_directory_audit" ADD CONSTRAINT "hub_directory_audit_organization_id_hub_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."hub_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_invitations" ADD CONSTRAINT "hub_invitations_organization_id_hub_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."hub_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_memberships" ADD CONSTRAINT "hub_memberships_organization_id_hub_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."hub_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_notifications" ADD CONSTRAINT "hub_notifications_organization_id_hub_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."hub_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_push_deliveries" ADD CONSTRAINT "hub_push_deliveries_notification_id_hub_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."hub_notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_push_deliveries" ADD CONSTRAINT "hub_push_deliveries_device_id_hub_push_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."hub_push_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_volunteer_assignment_changes" ADD CONSTRAINT "hub_volunteer_assignment_changes_organization_id_assignment_id_hub_volunteer_assignments_organization_id_id_fk" FOREIGN KEY ("organization_id","assignment_id") REFERENCES "public"."hub_volunteer_assignments"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_volunteer_assignments" ADD CONSTRAINT "hub_volunteer_assignments_organization_id_hub_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."hub_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_volunteer_assignments" ADD CONSTRAINT "hub_volunteer_assignments_organization_id_group_id_groups_organization_id_id_fk" FOREIGN KEY ("organization_id","group_id") REFERENCES "himmah"."groups"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_volunteer_assignments" ADD CONSTRAINT "hub_volunteer_assignments_organization_id_activity_id_hub_activities_organization_id_id_fk" FOREIGN KEY ("organization_id","activity_id") REFERENCES "public"."hub_activities"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."communication_assignments" ADD CONSTRAINT "communication_assignments_organization_id_subject_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","subject_contact_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."communication_assignments" ADD CONSTRAINT "communication_assignments_organization_id_responsible_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","responsible_contact_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."contact_communication_preferences" ADD CONSTRAINT "contact_communication_preferences_organization_id_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."contact_methods" ADD CONSTRAINT "contact_methods_organization_id_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."contact_relationships" ADD CONSTRAINT "contact_relationships_organization_id_source_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","source_contact_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."contact_relationships" ADD CONSTRAINT "contact_relationships_organization_id_target_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","target_contact_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."contact_relationships" ADD CONSTRAINT "contact_relationships_organization_id_type_id_type_version_id_relationship_type_versions_organization_id_type_id_id_fk" FOREIGN KEY ("organization_id","type_id","type_version_id") REFERENCES "himmah"."relationship_type_versions"("organization_id","type_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."contacts" ADD CONSTRAINT "contacts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "himmah"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."people_audit_events" ADD CONSTRAINT "people_audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "himmah"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."people_audit_events" ADD CONSTRAINT "people_audit_events_organization_id_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."group_events" ADD CONSTRAINT "group_events_organization_id_group_id_groups_organization_id_id_fk" FOREIGN KEY ("organization_id","group_id") REFERENCES "himmah"."groups"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."group_events" ADD CONSTRAINT "group_events_organization_id_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."group_memberships" ADD CONSTRAINT "group_memberships_organization_id_group_id_groups_organization_id_id_fk" FOREIGN KEY ("organization_id","group_id") REFERENCES "himmah"."groups"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."group_memberships" ADD CONSTRAINT "group_memberships_organization_id_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."group_operation_requests" ADD CONSTRAINT "group_operation_requests_organization_id_group_id_groups_organization_id_id_fk" FOREIGN KEY ("organization_id","group_id") REFERENCES "himmah"."groups"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."groups" ADD CONSTRAINT "groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "himmah"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."staff_memberships" ADD CONSTRAINT "staff_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "himmah"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."operation_receipts" ADD CONSTRAINT "operation_receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "himmah"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."operation_receipts" ADD CONSTRAINT "operation_receipts_organization_id_contact_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","contact_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."relationship_type_versions" ADD CONSTRAINT "relationship_type_versions_organization_id_type_id_relationship_types_organization_id_id_fk" FOREIGN KEY ("organization_id","type_id") REFERENCES "himmah"."relationship_types"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."relationship_types" ADD CONSTRAINT "relationship_types_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "himmah"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."relationship_type_events" ADD CONSTRAINT "relationship_type_events_organization_id_type_id_relationship_types_organization_id_id_fk" FOREIGN KEY ("organization_id","type_id") REFERENCES "himmah"."relationship_types"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "himmah"."relationship_type_requests" ADD CONSTRAINT "relationship_type_requests_organization_id_type_id_relationship_types_organization_id_id_fk" FOREIGN KEY ("organization_id","type_id") REFERENCES "himmah"."relationship_types"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hub_activity_page" ON "hub_activities" USING btree ("organization_id","cancelled","created_at","id");--> statement-breakpoint
CREATE INDEX "hub_session_schedule" ON "hub_activity_sessions" USING btree ("organization_id","activity_id","starts_at","id");--> statement-breakpoint
CREATE INDEX "hub_attendance_history_page" ON "hub_attendance_changes" USING btree ("organization_id","session_id","person_id","created_at","id");--> statement-breakpoint
CREATE INDEX "hub_directory_audit_org" ON "hub_directory_audit" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "hub_invitation_page" ON "hub_invitations" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX "hub_membership_user" ON "hub_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "hub_notification_page" ON "hub_notifications" USING btree ("user_id","organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX "hub_push_due" ON "hub_push_deliveries" USING btree ("state","next_at");--> statement-breakpoint
CREATE INDEX "hub_push_user" ON "hub_push_devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "hub_volunteer_assignment_history" ON "hub_volunteer_assignment_changes" USING btree ("organization_id","assignment_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_volunteer_active_group" ON "hub_volunteer_assignments" USING btree ("organization_id","user_id","group_id") WHERE "hub_volunteer_assignments"."revoked_at" is null and "hub_volunteer_assignments"."group_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "hub_volunteer_active_activity" ON "hub_volunteer_assignments" USING btree ("organization_id","user_id","activity_id") WHERE "hub_volunteer_assignments"."revoked_at" is null and "hub_volunteer_assignments"."activity_id" is not null;--> statement-breakpoint
CREATE INDEX "hub_volunteer_assignment_page" ON "hub_volunteer_assignments" USING btree ("organization_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_active_pair" ON "himmah"."communication_assignments" USING btree ("organization_id","subject_contact_id","responsible_contact_id","purpose","channel") WHERE "himmah"."communication_assignments"."valid_to" is null;--> statement-breakpoint
CREATE INDEX "communication_routing" ON "himmah"."communication_assignments" USING btree ("organization_id","subject_contact_id","purpose","priority","id");--> statement-breakpoint
CREATE INDEX "communication_responsible" ON "himmah"."communication_assignments" USING btree ("organization_id","responsible_contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "method_active_value" ON "himmah"."contact_methods" USING btree ("organization_id","contact_id","kind","normalized_value") WHERE "himmah"."contact_methods"."ended_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "method_active_preferred" ON "himmah"."contact_methods" USING btree ("organization_id","contact_id","kind") WHERE "himmah"."contact_methods"."ended_at" is null and "himmah"."contact_methods"."preferred";--> statement-breakpoint
CREATE INDEX "methods_page" ON "himmah"."contact_methods" USING btree ("organization_id","contact_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "relationship_active_edge" ON "himmah"."contact_relationships" USING btree ("organization_id","type_id","source_contact_id","target_contact_id") WHERE "himmah"."contact_relationships"."valid_to" is null;--> statement-breakpoint
CREATE INDEX "relationship_source_page" ON "himmah"."contact_relationships" USING btree ("organization_id","source_contact_id","created_at","id");--> statement-breakpoint
CREATE INDEX "relationship_target_page" ON "himmah"."contact_relationships" USING btree ("organization_id","target_contact_id","created_at","id");--> statement-breakpoint
CREATE INDEX "contacts_page" ON "himmah"."contacts" USING btree ("organization_id","archived_at","created_at","id");--> statement-breakpoint
CREATE INDEX "people_history_page" ON "himmah"."people_audit_events" USING btree ("organization_id","contact_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "group_events_page" ON "himmah"."group_events" USING btree ("organization_id","group_id","occurred_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_active_pair" ON "himmah"."group_memberships" USING btree ("organization_id","group_id","contact_id") WHERE "himmah"."group_memberships"."valid_to" is null;--> statement-breakpoint
CREATE INDEX "memberships_group_page" ON "himmah"."group_memberships" USING btree ("organization_id","group_id","created_at","id");--> statement-breakpoint
CREATE INDEX "memberships_contact_page" ON "himmah"."group_memberships" USING btree ("organization_id","contact_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_active_name" ON "himmah"."groups" USING btree ("organization_id",lower("name")) WHERE "himmah"."groups"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "groups_page" ON "himmah"."groups" USING btree ("organization_id","archived_at","created_at","id");--> statement-breakpoint
CREATE INDEX "relationship_types_page" ON "himmah"."relationship_types" USING btree ("organization_id","archived_at","created_at","id");--> statement-breakpoint
CREATE INDEX "relationship_type_events_page" ON "himmah"."relationship_type_events" USING btree ("organization_id","type_id","occurred_at","id");
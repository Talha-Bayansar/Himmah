CREATE TABLE "hub_billing_requests" (
	"organization_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_billing_requests_organization_id_request_key_pk" PRIMARY KEY("organization_id","request_key")
);
--> statement-breakpoint
ALTER TABLE "hub_registration_charges" ALTER COLUMN "registration_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "hub_registration_charges" ADD COLUMN "activity_id" uuid;--> statement-breakpoint
ALTER TABLE "hub_registration_charges" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "hub_registration_charges" ADD COLUMN "person_id" uuid;--> statement-breakpoint
ALTER TABLE "hub_registration_charges" ADD COLUMN "source" text DEFAULT 'registration' NOT NULL;--> statement-breakpoint
ALTER TABLE "hub_billing_requests" ADD CONSTRAINT "hub_billing_requests_organization_id_activity_id_session_id_hub_activity_sessions_organization_id_activity_id_id_fk" FOREIGN KEY ("organization_id","activity_id","session_id") REFERENCES "public"."hub_activity_sessions"("organization_id","activity_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Preserve principal IDs and all receipt/allocation references; fill scope metadata only.
DO $backfill$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='hub_registration_charges'::regclass AND tgname='hub_charge_immutable') THEN ALTER TABLE hub_registration_charges DISABLE TRIGGER hub_charge_immutable; END IF;
 UPDATE hub_registration_charges ch SET activity_id=r.activity_id,session_id=r.session_id,person_id=r.person_id FROM hub_session_registrations r WHERE r.organization_id=ch.organization_id AND r.id=ch.registration_id;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='hub_registration_charges'::regclass AND tgname='hub_charge_immutable') THEN ALTER TABLE hub_registration_charges ENABLE TRIGGER hub_charge_immutable; END IF;
END $backfill$;
ALTER TABLE hub_registration_charges ALTER COLUMN activity_id SET NOT NULL,ALTER COLUMN session_id SET NOT NULL,ALTER COLUMN person_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "hub_registration_charges" ADD CONSTRAINT "hub_registration_charges_organization_id_activity_id_session_id_hub_activity_sessions_organization_id_activity_id_id_fk" FOREIGN KEY ("organization_id","activity_id","session_id") REFERENCES "public"."hub_activity_sessions"("organization_id","activity_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_registration_charges" ADD CONSTRAINT "hub_registration_charges_organization_id_person_id_contacts_organization_id_id_fk" FOREIGN KEY ("organization_id","person_id") REFERENCES "himmah"."contacts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_registration_charges" ADD CONSTRAINT "hub_charge_session_person" UNIQUE("organization_id","session_id","person_id");--> statement-breakpoint
ALTER TABLE "hub_registration_charges" ADD CONSTRAINT "hub_charge_source" CHECK (("hub_registration_charges"."source"='registration' and "hub_registration_charges"."registration_id" is not null) or ("hub_registration_charges"."source"='walk_in' and "hub_registration_charges"."registration_id" is null));
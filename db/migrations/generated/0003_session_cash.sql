CREATE TABLE "hub_cash_allocations" (
	"organization_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	CONSTRAINT "hub_cash_allocations_organization_id_receipt_id_charge_id_pk" PRIMARY KEY("organization_id","receipt_id","charge_id"),
	CONSTRAINT "hub_cash_allocation_amount" CHECK ("hub_cash_allocations"."amount_minor" between 1 and 100000000)
);
--> statement-breakpoint
CREATE TABLE "hub_cash_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"payer_label" text DEFAULT '' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_cash_receipt_scope" UNIQUE("organization_id","id"),
	CONSTRAINT "hub_cash_receipt_amount" CHECK ("hub_cash_receipts"."amount_minor" between 1 and 100000000),
	CONSTRAINT "hub_cash_receipt_currency" CHECK ("hub_cash_receipts"."currency"='EUR'),
	CONSTRAINT "hub_cash_payer_bound" CHECK (length("hub_cash_receipts"."payer_label")<=100)
);
--> statement-breakpoint
CREATE TABLE "hub_cash_requests" (
	"organization_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_cash_requests_organization_id_request_key_pk" PRIMARY KEY("organization_id","request_key")
);
--> statement-breakpoint
CREATE TABLE "hub_cash_reversals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_cash_reversal_receipt" UNIQUE("organization_id","receipt_id"),
	CONSTRAINT "hub_cash_reversal_reason" CHECK (length(trim("hub_cash_reversals"."reason")) between 1 and 300)
);
--> statement-breakpoint
ALTER TABLE "hub_volunteer_assignments" ADD COLUMN "can_collect" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hub_registration_charges" ADD CONSTRAINT "hub_charge_scope" UNIQUE("organization_id","id");--> statement-breakpoint
ALTER TABLE "hub_cash_allocations" ADD CONSTRAINT "hub_cash_allocations_organization_id_receipt_id_hub_cash_receipts_organization_id_id_fk" FOREIGN KEY ("organization_id","receipt_id") REFERENCES "public"."hub_cash_receipts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_cash_allocations" ADD CONSTRAINT "hub_cash_allocations_organization_id_charge_id_hub_registration_charges_organization_id_id_fk" FOREIGN KEY ("organization_id","charge_id") REFERENCES "public"."hub_registration_charges"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_cash_receipts" ADD CONSTRAINT "hub_cash_receipts_organization_id_activity_id_session_id_hub_activity_sessions_organization_id_activity_id_id_fk" FOREIGN KEY ("organization_id","activity_id","session_id") REFERENCES "public"."hub_activity_sessions"("organization_id","activity_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_cash_requests" ADD CONSTRAINT "hub_cash_requests_organization_id_activity_id_session_id_hub_activity_sessions_organization_id_activity_id_id_fk" FOREIGN KEY ("organization_id","activity_id","session_id") REFERENCES "public"."hub_activity_sessions"("organization_id","activity_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_cash_reversals" ADD CONSTRAINT "hub_cash_reversals_organization_id_receipt_id_hub_cash_receipts_organization_id_id_fk" FOREIGN KEY ("organization_id","receipt_id") REFERENCES "public"."hub_cash_receipts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hub_cash_allocation_charge" ON "hub_cash_allocations" USING btree ("organization_id","charge_id");--> statement-breakpoint
CREATE INDEX "hub_cash_receipt_page" ON "hub_cash_receipts" USING btree ("organization_id","session_id","created_at","id");
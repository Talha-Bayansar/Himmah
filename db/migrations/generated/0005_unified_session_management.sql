CREATE TABLE "hub_cash_allocation_corrections" (
	"organization_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_cash_correction_pk" PRIMARY KEY("organization_id","receipt_id","charge_id")
);
--> statement-breakpoint
CREATE TABLE "hub_session_operations" (
	"organization_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hub_session_operations_organization_id_request_key_pk" PRIMARY KEY("organization_id","request_key")
);
--> statement-breakpoint
ALTER TABLE "hub_cash_allocation_corrections" ADD CONSTRAINT "hub_cash_correction_allocation_fk" FOREIGN KEY ("organization_id","receipt_id","charge_id") REFERENCES "public"."hub_cash_allocations"("organization_id","receipt_id","charge_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_session_operations" ADD CONSTRAINT "hub_session_operation_session_fk" FOREIGN KEY ("organization_id","activity_id","session_id") REFERENCES "public"."hub_activity_sessions"("organization_id","activity_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hub_cash_correction_charge" ON "hub_cash_allocation_corrections" USING btree ("organization_id","charge_id");
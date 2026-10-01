CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'denied', 'expired');--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" uuid,
	"tool_name" text NOT NULL,
	"tool_input" jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"requested_by" text,
	"channel_id" text NOT NULL,
	"thread_ts" text NOT NULL,
	"message_ts" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_workspace_id_created_at_index" ON "approvals" USING btree ("workspace_id","created_at");
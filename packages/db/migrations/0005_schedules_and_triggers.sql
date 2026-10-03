CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"cron" text NOT NULL,
	"timezone" text NOT NULL,
	"prompt" text NOT NULL,
	"channel_id" text NOT NULL,
	"created_by" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trigger_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"composio_trigger_id" text NOT NULL,
	"trigger_slug" text NOT NULL,
	"trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"instruction" text NOT NULL,
	"channel_id" text NOT NULL,
	"created_by" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_fired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_subscriptions" ADD CONSTRAINT "trigger_subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedules_workspace_id_index" ON "schedules" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trigger_subscriptions_composio_trigger_id_index" ON "trigger_subscriptions" USING btree ("composio_trigger_id");--> statement-breakpoint
CREATE INDEX "trigger_subscriptions_workspace_id_index" ON "trigger_subscriptions" USING btree ("workspace_id");
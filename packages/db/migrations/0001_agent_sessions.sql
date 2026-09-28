CREATE TABLE "agent_session_entries" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"project_key" text NOT NULL,
	"session_id" text NOT NULL,
	"subpath" text DEFAULT '' NOT NULL,
	"uuid" text,
	"entry" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "threads" ADD COLUMN "total_cost_usd" numeric(12, 6) DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "agent_session_entries_project_key_session_id_subpath_seq_index" ON "agent_session_entries" USING btree ("project_key","session_id","subpath","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_session_entries_project_key_session_id_subpath_uuid_index" ON "agent_session_entries" USING btree ("project_key","session_id","subpath","uuid") WHERE "agent_session_entries"."uuid" is not null;
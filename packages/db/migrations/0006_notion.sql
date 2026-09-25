CREATE TABLE "expense_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"edited_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notion_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" text NOT NULL,
	"workspace_name" text NOT NULL,
	"bot_id" text NOT NULL,
	"access_token_enc" "bytea" NOT NULL,
	"database_id" text,
	"data_source_id" text,
	"direction" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"cursor" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notion_connections_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "expense_versions" ADD CONSTRAINT "expense_versions_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_versions" ADD CONSTRAINT "expense_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_connections" ADD CONSTRAINT "notion_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_versions_expense_id_idx" ON "expense_versions" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "expense_versions_user_id_idx" ON "expense_versions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notion_connections_user_id_idx" ON "notion_connections" USING btree ("user_id");
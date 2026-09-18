CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"colour" text NOT NULL,
	"default_kind" text,
	"budget_minor" bigint,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid,
	"description" text NOT NULL,
	"expense_date" date NOT NULL,
	"paid_with" text NOT NULL,
	"kind" text NOT NULL,
	"notes" text,
	"amount_original" bigint NOT NULL,
	"currency_original" text NOT NULL,
	"rate_to_default" numeric(20, 10),
	"rate_date" date,
	"rate_source" text,
	"amount_default" bigint,
	"rate_overridden" boolean DEFAULT false NOT NULL,
	"added_via" text NOT NULL,
	"import_batch_id" uuid,
	"notion_page_id" text,
	"notion_last_edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_user_id_idx" ON "categories" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_user_id_name_unique" ON "categories" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "expenses_user_id_expense_date_idx" ON "expenses" USING btree ("user_id","expense_date");--> statement-breakpoint
CREATE INDEX "expenses_user_id_deleted_at_idx" ON "expenses" USING btree ("user_id","deleted_at");--> statement-breakpoint
CREATE INDEX "expenses_user_id_category_id_idx" ON "expenses" USING btree ("user_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_user_id_notion_page_id_unique" ON "expenses" USING btree ("user_id","notion_page_id") WHERE notion_page_id IS NOT NULL;
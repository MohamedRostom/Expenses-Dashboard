CREATE TABLE "capture_category_map" (
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "capture_category_map_user_id_label_pk" PRIMARY KEY("user_id","label")
);
--> statement-breakpoint
CREATE TABLE "capture_receipts" (
	"token_id" uuid NOT NULL,
	"receipt_key" text NOT NULL,
	"expense_id" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capture_receipts_token_id_receipt_key_pk" PRIMARY KEY("token_id","receipt_key")
);
--> statement-breakpoint
CREATE TABLE "capture_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"label" text DEFAULT 'generic' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "capture_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "capture_category_map" ADD CONSTRAINT "capture_category_map_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_category_map" ADD CONSTRAINT "capture_category_map_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_receipts" ADD CONSTRAINT "capture_receipts_token_id_capture_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."capture_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_tokens" ADD CONSTRAINT "capture_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capture_tokens_user_id_idx" ON "capture_tokens" USING btree ("user_id");
ALTER TABLE "users" ADD COLUMN "font" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_font_check" CHECK ("font" IN ('system', 'serif', 'rounded', 'humanist'));

ALTER TABLE "users" ADD COLUMN "accent_custom" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ground_tint" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "nav_colour" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_accent_custom_check" CHECK ("accent_custom" IS NULL OR "accent_custom" ~ '^#[0-9a-f]{6}$');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_ground_tint_check" CHECK ("ground_tint" IS NULL OR "ground_tint" ~ '^#[0-9a-f]{6}$');--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_nav_colour_check" CHECK ("nav_colour" IS NULL OR "nav_colour" ~ '^#[0-9a-f]{6}$');

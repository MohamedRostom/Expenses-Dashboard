ALTER TABLE "users" ADD COLUMN "motion_preset" text DEFAULT 'particles' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "motion_colour" text DEFAULT '#7fd1a8' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "panels_translucent" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "motion_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- The ids must match MOTION_PRESET_IDS in packages/contracts/src/motion.ts.
ALTER TABLE "users" ADD CONSTRAINT "users_motion_preset_check" CHECK ("motion_preset" IN ('none', 'aurora', 'grid', 'particles', 'grain'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_motion_colour_check" CHECK ("motion_colour" ~ '^#[0-9a-f]{6}$');

ALTER TABLE "users" ADD COLUMN "accent" text DEFAULT 'signal-green' NOT NULL;--> statement-breakpoint
-- The ids must match ACCENT_IDS in packages/contracts/src/accent.ts.
ALTER TABLE "users" ADD CONSTRAINT "users_accent_check" CHECK ("accent" IN ('signal-green', 'concourse-blue', 'platform-teal', 'violet', 'slate', 'plum'));

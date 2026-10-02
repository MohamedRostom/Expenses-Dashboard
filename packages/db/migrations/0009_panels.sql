CREATE TABLE "account_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"provider_calendar_id" text NOT NULL,
	"name" text NOT NULL,
	"is_primary" boolean NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"colour" text,
	"cursor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cached_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"provider_event_id" text NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"all_day" boolean NOT NULL,
	"time_zone" text,
	"location" text,
	"tentative" boolean DEFAULT false NOT NULL,
	"link" text,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cached_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"provider_message_id" text NOT NULL,
	"from_name" text,
	"from_address" text NOT NULL,
	"subject" text NOT NULL,
	"preview" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"unread" boolean NOT NULL,
	"link" text,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connected_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"address" text NOT NULL,
	"label" text NOT NULL,
	"colour" text,
	"capabilities" text[] DEFAULT '{}'::text[] NOT NULL,
	"granted_scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"credential_enc" "bytea" NOT NULL,
	"status" text NOT NULL,
	"paused_at" timestamp with time zone,
	"last_refresh_at" timestamp with time zone,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"next_refresh_at" timestamp with time zone NOT NULL,
	"mail_cursor" text,
	"unread_total" integer,
	"cache_purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_calendars" ADD CONSTRAINT "account_calendars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_calendars" ADD CONSTRAINT "account_calendars_account_id_connected_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cached_events" ADD CONSTRAINT "cached_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cached_events" ADD CONSTRAINT "cached_events_account_id_connected_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cached_events" ADD CONSTRAINT "cached_events_calendar_id_account_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."account_calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cached_messages" ADD CONSTRAINT "cached_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cached_messages" ADD CONSTRAINT "cached_messages_account_id_connected_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."connected_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connected_accounts" ADD CONSTRAINT "connected_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_calendars_user_id_idx" ON "account_calendars" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_calendars_account_id_provider_calendar_id_unique" ON "account_calendars" USING btree ("account_id","provider_calendar_id");--> statement-breakpoint
CREATE INDEX "cached_events_user_id_idx" ON "cached_events" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cached_events_calendar_id_provider_event_id_unique" ON "cached_events" USING btree ("calendar_id","provider_event_id");--> statement-breakpoint
CREATE INDEX "cached_events_user_id_starts_at_idx" ON "cached_events" USING btree ("user_id","starts_at");--> statement-breakpoint
CREATE INDEX "cached_messages_user_id_idx" ON "cached_messages" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cached_messages_account_id_provider_message_id_unique" ON "cached_messages" USING btree ("account_id","provider_message_id");--> statement-breakpoint
CREATE INDEX "cached_messages_user_id_received_at_idx" ON "cached_messages" USING btree ("user_id","received_at");--> statement-breakpoint
CREATE INDEX "connected_accounts_user_id_idx" ON "connected_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connected_accounts_user_id_provider_address_unique" ON "connected_accounts" USING btree ("user_id","provider","address");--> statement-breakpoint
INSERT INTO "flags" ("key", "description", "default_on") VALUES
  ('panels.today', 'Today page, Connections settings and their routes', false),
  ('panels.google_calendar', 'Google Calendar panel', false),
  ('panels.google_mail', 'Google Mail panel (gated on CASA assessment)', false),
  ('panels.microsoft', 'Microsoft Outlook Calendar and Mail panels', false),
  ('panels.standards', 'IMAP and CalDAV standards-based panels', false)
ON CONFLICT ("key") DO NOTHING;
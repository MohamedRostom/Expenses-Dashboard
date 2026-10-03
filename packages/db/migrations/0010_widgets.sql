CREATE TABLE "geocode_cache" (
	"query" text PRIMARY KEY NOT NULL,
	"results" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"admin1" text,
	"country" text NOT NULL,
	"time_zone" text NOT NULL,
	"lat" numeric(5, 2) NOT NULL,
	"lon" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weather_readings" (
	"lat" numeric(5, 2) NOT NULL,
	"lon" numeric(5, 2) NOT NULL,
	"time_zone" text NOT NULL,
	"current" jsonb,
	"daily" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	CONSTRAINT "weather_readings_lat_lon_pk" PRIMARY KEY("lat","lon")
);
--> statement-breakpoint
CREATE TABLE "widget_source_state" (
	"source" text PRIMARY KEY NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "widget_source_usage" (
	"day" date NOT NULL,
	"source" text NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "widget_source_usage_day_source_pk" PRIMARY KEY("day","source")
);
--> statement-breakpoint
CREATE TABLE "widgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"position" integer NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"place_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "flags" ADD COLUMN "value" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "temperature_unit" text DEFAULT 'C' NOT NULL;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widgets" ADD CONSTRAINT "widgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widgets" ADD CONSTRAINT "widgets_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "places_user_id_lat_lon_unique" ON "places" USING btree ("user_id","lat","lon");--> statement-breakpoint
CREATE INDEX "widgets_user_id_position_idx" ON "widgets" USING btree ("user_id","position");--> statement-breakpoint
-- Hand-added (drizzle can't generate DEFERRABLE): a full reorder is one transaction.
ALTER TABLE "widgets" ADD CONSTRAINT "widgets_user_id_position_unique" UNIQUE ("user_id","position") DEFERRABLE INITIALLY DEFERRED;

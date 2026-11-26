CREATE INDEX IF NOT EXISTS "expenses_user_id_id_idx" ON "expenses" USING btree ("user_id","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fx_rates_base_quote_rate_date_idx" ON "fx_rates" USING btree ("base","quote","rate_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cached_events_account_id_starts_at_idx" ON "cached_events" USING btree ("account_id","starts_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "connected_accounts_next_refresh_at_idx" ON "connected_accounts" USING btree ("next_refresh_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_name_status_idx" ON "jobs" USING btree ("name","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_last_active_at_idx" ON "users" USING btree ("last_active_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_unverified_created_at_idx" ON "users" USING btree ("created_at") WHERE "email_verified_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
DROP INDEX IF EXISTS "expense_versions_expense_id_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_versions_expense_id_created_at_idx" ON "expense_versions" USING btree ("expense_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_versions_created_at_idx" ON "expense_versions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limits_window_start_idx" ON "rate_limits" USING btree ("window_start");

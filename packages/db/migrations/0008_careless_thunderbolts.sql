CREATE INDEX "jobs_user_id_idx" ON "jobs" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_amount_original_nonzero" CHECK ("expenses"."amount_original" <> 0);--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_with_check" CHECK ("expenses"."paid_with" IN ('card','cash','bank_transfer','other'));--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_kind_check" CHECK ("expenses"."kind" IN ('fixed','variable','one_off'));
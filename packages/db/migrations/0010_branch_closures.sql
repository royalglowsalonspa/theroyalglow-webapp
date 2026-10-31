ALTER TABLE "holiday" DROP CONSTRAINT "holiday_date_unique";--> statement-breakpoint
ALTER TABLE "holiday" ADD COLUMN "branch_id" text;--> statement-breakpoint
ALTER TABLE "holiday" ADD CONSTRAINT "holiday_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "holiday_branch_date_uidx" ON "holiday" USING btree ("branch_id","date") WHERE branch_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "holiday_all_branches_date_uidx" ON "holiday" USING btree ("date") WHERE branch_id IS NULL;
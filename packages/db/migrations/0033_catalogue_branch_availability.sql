CREATE TABLE "service_branch" (
	"service_id" text NOT NULL,
	"branch_id" text NOT NULL,
	CONSTRAINT "service_branch_service_id_branch_id_pk" PRIMARY KEY("service_id","branch_id")
);
--> statement-breakpoint
CREATE TABLE "service_category_branch" (
	"category_id" text NOT NULL,
	"branch_id" text NOT NULL,
	CONSTRAINT "service_category_branch_category_id_branch_id_pk" PRIMARY KEY("category_id","branch_id")
);
--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "all_branches" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "service_category" ADD COLUMN "all_branches" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "service_branch" ADD CONSTRAINT "service_branch_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_branch" ADD CONSTRAINT "service_branch_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_category_branch" ADD CONSTRAINT "service_category_branch_category_id_service_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_category_branch" ADD CONSTRAINT "service_category_branch_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_branch_branch_id_idx" ON "service_branch" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "service_category_branch_branch_id_idx" ON "service_category_branch" USING btree ("branch_id");
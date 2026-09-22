import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."users" ADD COLUMN "reset_password_requested_at" timestamp(3) with time zone;
  ALTER TABLE "cms"."media" ADD COLUMN "_objectkey" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."users" DROP COLUMN "reset_password_requested_at";
  ALTER TABLE "cms"."media" DROP COLUMN "_objectkey";`)
}

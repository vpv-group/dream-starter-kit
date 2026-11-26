import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "cms"."enum_payload_jobs_log_task_slug" ADD VALUE 'push-receipts' BEFORE 'dream-site-report';
  ALTER TYPE "cms"."enum_payload_jobs_task_slug" ADD VALUE 'push-receipts' BEFORE 'dream-site-report';
  ALTER TABLE "cms"."notifications" ADD COLUMN "attempts" numeric DEFAULT 0;`);
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "cms"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "cms"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dispatch-notifications', 'dream-site-report', 'account-erasure', 'favorites-cleanup', 'cms-user-sync', 'schedulePublish');
  ALTER TABLE "cms"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "cms"."enum_payload_jobs_log_task_slug" USING "task_slug"::"cms"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "cms"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "cms"."enum_payload_jobs_task_slug";
  CREATE TYPE "cms"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dispatch-notifications', 'dream-site-report', 'account-erasure', 'favorites-cleanup', 'cms-user-sync', 'schedulePublish');
  ALTER TABLE "cms"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "cms"."enum_payload_jobs_task_slug" USING "task_slug"::"cms"."enum_payload_jobs_task_slug";
  ALTER TABLE "cms"."notifications" DROP COLUMN "attempts";`);
}

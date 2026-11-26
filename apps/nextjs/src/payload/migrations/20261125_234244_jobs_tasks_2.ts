import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "cms"."enum_payload_jobs_log_task_slug" ADD VALUE 'account-erasure' BEFORE 'schedulePublish';
  ALTER TYPE "cms"."enum_payload_jobs_log_task_slug" ADD VALUE 'favorites-cleanup' BEFORE 'schedulePublish';
  ALTER TYPE "cms"."enum_payload_jobs_log_task_slug" ADD VALUE 'cms-user-sync' BEFORE 'schedulePublish';
  ALTER TYPE "cms"."enum_payload_jobs_task_slug" ADD VALUE 'account-erasure' BEFORE 'schedulePublish';
  ALTER TYPE "cms"."enum_payload_jobs_task_slug" ADD VALUE 'favorites-cleanup' BEFORE 'schedulePublish';
  ALTER TYPE "cms"."enum_payload_jobs_task_slug" ADD VALUE 'cms-user-sync' BEFORE 'schedulePublish';`)
  // Expand/contract: the removed device-tokens collection keeps its table for
  // one release (the previous release still reads it if an update is
  // reverted). A later release drops it (dream:contract).
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "cms"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "cms"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "cms"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dispatch-notifications', 'dream-site-report', 'schedulePublish');
  ALTER TABLE "cms"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "cms"."enum_payload_jobs_log_task_slug" USING "task_slug"::"cms"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "cms"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "cms"."enum_payload_jobs_task_slug";
  CREATE TYPE "cms"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dispatch-notifications', 'dream-site-report', 'schedulePublish');
  ALTER TABLE "cms"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "cms"."enum_payload_jobs_task_slug" USING "task_slug"::"cms"."enum_payload_jobs_task_slug";`)
}

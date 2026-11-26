import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "cms"."enum_payload_jobs_log_task_slug" ADD VALUE 'dispatch-notifications' BEFORE 'schedulePublish';
  ALTER TYPE "cms"."enum_payload_jobs_log_task_slug" ADD VALUE 'dream-site-report' BEFORE 'schedulePublish';
  ALTER TYPE "cms"."enum_payload_jobs_task_slug" ADD VALUE 'dispatch-notifications' BEFORE 'schedulePublish';
  ALTER TYPE "cms"."enum_payload_jobs_task_slug" ADD VALUE 'dream-site-report' BEFORE 'schedulePublish';
  CREATE TABLE "cms"."payload_jobs_stats" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"stats" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "cms"."payload_jobs" ADD COLUMN "meta" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "cms"."payload_jobs_stats" CASCADE;
  ALTER TABLE "cms"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "cms"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "cms"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'schedulePublish');
  ALTER TABLE "cms"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "cms"."enum_payload_jobs_log_task_slug" USING "task_slug"::"cms"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "cms"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "cms"."enum_payload_jobs_task_slug";
  CREATE TYPE "cms"."enum_payload_jobs_task_slug" AS ENUM('inline', 'schedulePublish');
  ALTER TABLE "cms"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "cms"."enum_payload_jobs_task_slug" USING "task_slug"::"cms"."enum_payload_jobs_task_slug";
  ALTER TABLE "cms"."payload_jobs" DROP COLUMN "meta";`)
}

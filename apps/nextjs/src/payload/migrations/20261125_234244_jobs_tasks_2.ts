import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "cms"."enum_payload_jobs_log_task_slug" ADD VALUE 'account-erasure' BEFORE 'schedulePublish';
  ALTER TYPE "cms"."enum_payload_jobs_log_task_slug" ADD VALUE 'favorites-cleanup' BEFORE 'schedulePublish';
  ALTER TYPE "cms"."enum_payload_jobs_log_task_slug" ADD VALUE 'cms-user-sync' BEFORE 'schedulePublish';
  ALTER TYPE "cms"."enum_payload_jobs_task_slug" ADD VALUE 'account-erasure' BEFORE 'schedulePublish';
  ALTER TYPE "cms"."enum_payload_jobs_task_slug" ADD VALUE 'favorites-cleanup' BEFORE 'schedulePublish';
  ALTER TYPE "cms"."enum_payload_jobs_task_slug" ADD VALUE 'cms-user-sync' BEFORE 'schedulePublish';
  DROP TABLE "cms"."device_tokens" CASCADE;
  DROP TYPE "cms"."enum_device_tokens_platform";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_device_tokens_platform" AS ENUM('ios', 'android', 'web');
  CREATE TABLE "cms"."device_tokens" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"token" varchar NOT NULL,
  	"platform" "cms"."enum_device_tokens_platform" NOT NULL,
  	"device_model" varchar,
  	"app_version" varchar,
  	"os_version" varchar,
  	"locale" varchar,
  	"push_enabled" boolean DEFAULT true,
  	"last_seen_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "cms"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "cms"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "cms"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'dispatch-notifications', 'dream-site-report', 'schedulePublish');
  ALTER TABLE "cms"."payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "cms"."enum_payload_jobs_log_task_slug" USING "task_slug"::"cms"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "cms"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "cms"."enum_payload_jobs_task_slug";
  CREATE TYPE "cms"."enum_payload_jobs_task_slug" AS ENUM('inline', 'dispatch-notifications', 'dream-site-report', 'schedulePublish');
  ALTER TABLE "cms"."payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "cms"."enum_payload_jobs_task_slug" USING "task_slug"::"cms"."enum_payload_jobs_task_slug";
  ALTER TABLE "cms"."device_tokens" ADD CONSTRAINT "device_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cms"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "device_tokens_user_idx" ON "cms"."device_tokens" USING btree ("user_id");
  CREATE UNIQUE INDEX "device_tokens_token_idx" ON "cms"."device_tokens" USING btree ("token");
  CREATE INDEX "device_tokens_updated_at_idx" ON "cms"."device_tokens" USING btree ("updated_at");
  CREATE INDEX "device_tokens_created_at_idx" ON "cms"."device_tokens" USING btree ("created_at");`)
}

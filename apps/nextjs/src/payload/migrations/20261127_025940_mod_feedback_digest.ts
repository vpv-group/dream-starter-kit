// GENERATED copy (`pnpm mod sync`) of modules/feedback/src/payload/migrations/20261127_025940_mod_feedback_digest.ts
// so the local `payload migrate` CLI applies it — do not edit.
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_kit_modules_mod_feedback_digest" AS ENUM('weekly', 'daily', 'never');
  CREATE TYPE "cms"."enum_mod_feedback_settings_digest" AS ENUM('weekly', 'daily', 'never');
  CREATE TYPE "cms"."enum__mod_feedback_settings_v_version_digest" AS ENUM('weekly', 'daily', 'never');
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_digest" "cms"."enum_kit_modules_mod_feedback_digest" DEFAULT 'weekly';
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "digest" "cms"."enum_mod_feedback_settings_digest" DEFAULT 'weekly';
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_digest" "cms"."enum__mod_feedback_settings_v_version_digest" DEFAULT 'weekly';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_digest";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "digest";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_digest";
  DROP TYPE "cms"."enum_kit_modules_mod_feedback_digest";
  DROP TYPE "cms"."enum_mod_feedback_settings_digest";
  DROP TYPE "cms"."enum__mod_feedback_settings_v_version_digest";`)
}

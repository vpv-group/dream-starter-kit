// GENERATED copy (`pnpm mod sync`) of modules/feedback/src/payload/migrations/20261126_215221_mod_feedback_autopilot.ts
// so the local `payload migrate` CLI applies it — do not edit.
import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_kit_modules_mod_feedback_ap_actions" AS ENUM('manual', 'automated');
  CREATE TYPE "cms"."enum_mod_feedback_settings_ap_actions" AS ENUM('manual', 'automated');
  CREATE TYPE "cms"."enum__mod_feedback_settings_v_version_ap_actions" AS ENUM('manual', 'automated');
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_ap_enabled" boolean DEFAULT true;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_ap_actions" "cms"."enum_kit_modules_mod_feedback_ap_actions" DEFAULT 'manual';
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_ap_dedupe" boolean DEFAULT true;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_ap_threshold" numeric DEFAULT 0.86;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_ap_merge_as_votes" boolean DEFAULT true;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_ap_categorize" boolean DEFAULT true;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_ap_summaries" boolean DEFAULT true;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_ap_drafts" boolean DEFAULT true;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_ap_daily_cap" numeric DEFAULT 200;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_ap_api_board" varchar DEFAULT 'feature-requests';
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_ap_replies" boolean DEFAULT false;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_ap_reply_as" varchar;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_ap_instructions" varchar;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "ap_enabled" boolean DEFAULT true;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "ap_actions" "cms"."enum_mod_feedback_settings_ap_actions" DEFAULT 'manual';
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "ap_dedupe" boolean DEFAULT true;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "ap_threshold" numeric DEFAULT 0.86;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "ap_merge_as_votes" boolean DEFAULT true;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "ap_categorize" boolean DEFAULT true;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "ap_summaries" boolean DEFAULT true;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "ap_drafts" boolean DEFAULT true;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "ap_daily_cap" numeric DEFAULT 200;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "ap_api_board" varchar DEFAULT 'feature-requests';
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "ap_replies" boolean DEFAULT false;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "ap_reply_as" varchar;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "ap_instructions" varchar;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_ap_enabled" boolean DEFAULT true;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_ap_actions" "cms"."enum__mod_feedback_settings_v_version_ap_actions" DEFAULT 'manual';
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_ap_dedupe" boolean DEFAULT true;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_ap_threshold" numeric DEFAULT 0.86;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_ap_merge_as_votes" boolean DEFAULT true;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_ap_categorize" boolean DEFAULT true;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_ap_summaries" boolean DEFAULT true;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_ap_drafts" boolean DEFAULT true;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_ap_daily_cap" numeric DEFAULT 200;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_ap_api_board" varchar DEFAULT 'feature-requests';
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_ap_replies" boolean DEFAULT false;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_ap_reply_as" varchar;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_ap_instructions" varchar;`);
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_ap_enabled";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_ap_actions";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_ap_dedupe";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_ap_threshold";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_ap_merge_as_votes";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_ap_categorize";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_ap_summaries";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_ap_drafts";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_ap_daily_cap";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_ap_api_board";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_ap_replies";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_ap_reply_as";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_ap_instructions";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "ap_enabled";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "ap_actions";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "ap_dedupe";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "ap_threshold";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "ap_merge_as_votes";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "ap_categorize";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "ap_summaries";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "ap_drafts";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "ap_daily_cap";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "ap_api_board";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "ap_replies";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "ap_reply_as";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "ap_instructions";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_ap_enabled";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_ap_actions";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_ap_dedupe";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_ap_threshold";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_ap_merge_as_votes";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_ap_categorize";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_ap_summaries";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_ap_drafts";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_ap_daily_cap";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_ap_api_board";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_ap_replies";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_ap_reply_as";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_ap_instructions";
  DROP TYPE "cms"."enum_kit_modules_mod_feedback_ap_actions";
  DROP TYPE "cms"."enum_mod_feedback_settings_ap_actions";
  DROP TYPE "cms"."enum__mod_feedback_settings_v_version_ap_actions";`);
}

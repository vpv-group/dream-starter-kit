import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_adapter_feedback_source_chat_enabled" boolean DEFAULT false;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_adapter_feedback_source_chat_keywords" varchar;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_adapter_feedback_source_chat_min_length" numeric DEFAULT 20;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "adapter_feedback_source_chat_enabled" boolean DEFAULT false;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "adapter_feedback_source_chat_keywords" varchar;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "adapter_feedback_source_chat_min_length" numeric DEFAULT 20;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_adapter_feedback_source_chat_enabled" boolean DEFAULT false;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_adapter_feedback_source_chat_keywords" varchar;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_adapter_feedback_source_chat_min_length" numeric DEFAULT 20;`);
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_adapter_feedback_source_chat_enabled";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_adapter_feedback_source_chat_keywords";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_adapter_feedback_source_chat_min_length";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "adapter_feedback_source_chat_enabled";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "adapter_feedback_source_chat_keywords";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "adapter_feedback_source_chat_min_length";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_adapter_feedback_source_chat_enabled";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_adapter_feedback_source_chat_keywords";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_adapter_feedback_source_chat_min_length";`);
}

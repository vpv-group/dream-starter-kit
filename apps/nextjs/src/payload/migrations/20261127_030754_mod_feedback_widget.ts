// GENERATED copy (`pnpm mod sync`) of modules/feedback/src/payload/migrations/20261127_030754_mod_feedback_widget.ts
// so the local `payload migrate` CLI applies it — do not edit.
import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_embed_enabled" boolean DEFAULT false;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_embed_origins" varchar;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "embed_enabled" boolean DEFAULT false;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "embed_origins" varchar;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_embed_enabled" boolean DEFAULT false;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_embed_origins" varchar;`);
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_embed_enabled";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_embed_origins";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "embed_enabled";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "embed_origins";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_embed_enabled";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_embed_origins";`);
}

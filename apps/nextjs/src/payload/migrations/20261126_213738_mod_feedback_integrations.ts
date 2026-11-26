// GENERATED copy (`pnpm mod sync`) of modules/feedback/src/payload/migrations/20261126_213738_mod_feedback_integrations.ts
// so the local `payload migrate` CLI applies it — do not edit.
import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_kit_modules_mod_feedback_gh_map_ext" AS ENUM('unstarted', 'started', 'completed', 'canceled');
  CREATE TYPE "cms"."enum_kit_modules_mod_feedback_gh_map_direction" AS ENUM('both', 'inbound', 'outbound');
  CREATE TYPE "cms"."enum_mod_feedback_settings_gh_map_ext" AS ENUM('unstarted', 'started', 'completed', 'canceled');
  CREATE TYPE "cms"."enum_mod_feedback_settings_gh_map_direction" AS ENUM('both', 'inbound', 'outbound');
  CREATE TYPE "cms"."enum__mod_feedback_settings_v_version_gh_map_ext" AS ENUM('unstarted', 'started', 'completed', 'canceled');
  CREATE TYPE "cms"."enum__mod_feedback_settings_v_version_gh_map_direction" AS ENUM('both', 'inbound', 'outbound');
  CREATE TABLE "cms"."kit_modules_mod_feedback_gh_map" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"ext" "cms"."enum_kit_modules_mod_feedback_gh_map_ext",
  	"stage" varchar,
  	"direction" "cms"."enum_kit_modules_mod_feedback_gh_map_direction" DEFAULT 'both'
  );
  
  CREATE TABLE "cms"."mod_feedback_settings_gh_map" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"ext" "cms"."enum_mod_feedback_settings_gh_map_ext" NOT NULL,
  	"stage" varchar NOT NULL,
  	"direction" "cms"."enum_mod_feedback_settings_gh_map_direction" DEFAULT 'both' NOT NULL
  );
  
  CREATE TABLE "cms"."_mod_feedback_settings_v_version_gh_map" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"ext" "cms"."enum__mod_feedback_settings_v_version_gh_map_ext" NOT NULL,
  	"stage" varchar NOT NULL,
  	"direction" "cms"."enum__mod_feedback_settings_v_version_gh_map_direction" DEFAULT 'both' NOT NULL,
  	"_uuid" varchar
  );
  
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_gh_enabled" boolean DEFAULT true;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_gh_backlink_comment" boolean DEFAULT true;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "gh_enabled" boolean DEFAULT true;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "gh_backlink_comment" boolean DEFAULT true;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_gh_enabled" boolean DEFAULT true;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_gh_backlink_comment" boolean DEFAULT true;
  ALTER TABLE "cms"."kit_modules_mod_feedback_gh_map" ADD CONSTRAINT "kit_modules_mod_feedback_gh_map_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."kit_modules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."mod_feedback_settings_gh_map" ADD CONSTRAINT "mod_feedback_settings_gh_map_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."mod_feedback_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_mod_feedback_settings_v_version_gh_map" ADD CONSTRAINT "_mod_feedback_settings_v_version_gh_map_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_mod_feedback_settings_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "kit_modules_mod_feedback_gh_map_order_idx" ON "cms"."kit_modules_mod_feedback_gh_map" USING btree ("_order");
  CREATE INDEX "kit_modules_mod_feedback_gh_map_parent_id_idx" ON "cms"."kit_modules_mod_feedback_gh_map" USING btree ("_parent_id");
  CREATE INDEX "mod_feedback_settings_gh_map_order_idx" ON "cms"."mod_feedback_settings_gh_map" USING btree ("_order");
  CREATE INDEX "mod_feedback_settings_gh_map_parent_id_idx" ON "cms"."mod_feedback_settings_gh_map" USING btree ("_parent_id");
  CREATE INDEX "_mod_feedback_settings_v_version_gh_map_order_idx" ON "cms"."_mod_feedback_settings_v_version_gh_map" USING btree ("_order");
  CREATE INDEX "_mod_feedback_settings_v_version_gh_map_parent_id_idx" ON "cms"."_mod_feedback_settings_v_version_gh_map" USING btree ("_parent_id");`);
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "cms"."kit_modules_mod_feedback_gh_map" CASCADE;
  DROP TABLE "cms"."mod_feedback_settings_gh_map" CASCADE;
  DROP TABLE "cms"."_mod_feedback_settings_v_version_gh_map" CASCADE;
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_gh_enabled";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_gh_backlink_comment";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "gh_enabled";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "gh_backlink_comment";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_gh_enabled";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_gh_backlink_comment";
  DROP TYPE "cms"."enum_kit_modules_mod_feedback_gh_map_ext";
  DROP TYPE "cms"."enum_kit_modules_mod_feedback_gh_map_direction";
  DROP TYPE "cms"."enum_mod_feedback_settings_gh_map_ext";
  DROP TYPE "cms"."enum_mod_feedback_settings_gh_map_direction";
  DROP TYPE "cms"."enum__mod_feedback_settings_v_version_gh_map_ext";
  DROP TYPE "cms"."enum__mod_feedback_settings_v_version_gh_map_direction";`);
}

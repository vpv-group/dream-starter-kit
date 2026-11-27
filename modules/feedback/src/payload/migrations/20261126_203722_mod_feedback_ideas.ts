import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_kit_modules_mod_feedback_idea_stages_type" AS ENUM('open', 'active', 'complete', 'closed');
  CREATE TYPE "cms"."enum_kit_modules_mod_feedback_idea_stages_tone" AS ENUM('neutral', 'info', 'warning', 'success', 'destructive');
  CREATE TYPE "cms"."enum_kit_modules_mod_feedback_score_factors_kind" AS ENUM('impact', 'effort');
  CREATE TYPE "cms"."enum_kit_modules_mod_feedback_score_factors_source" AS ENUM('manual', 'votes', 'priority', 'tagVoters');
  CREATE TYPE "cms"."enum_kit_modules_mod_feedback_score_factors_scale" AS ENUM('0-10', '0-100', 'fibonacci', 'stars', 'checkbox', 'percentage', 'number');
  CREATE TYPE "cms"."enum_mod_feedback_settings_idea_stages_type" AS ENUM('open', 'active', 'complete', 'closed');
  CREATE TYPE "cms"."enum_mod_feedback_settings_idea_stages_tone" AS ENUM('neutral', 'info', 'warning', 'success', 'destructive');
  CREATE TYPE "cms"."enum_mod_feedback_settings_score_factors_kind" AS ENUM('impact', 'effort');
  CREATE TYPE "cms"."enum_mod_feedback_settings_score_factors_source" AS ENUM('manual', 'votes', 'priority', 'tagVoters');
  CREATE TYPE "cms"."enum_mod_feedback_settings_score_factors_scale" AS ENUM('0-10', '0-100', 'fibonacci', 'stars', 'checkbox', 'percentage', 'number');
  CREATE TYPE "cms"."enum__mod_feedback_settings_v_version_idea_stages_type" AS ENUM('open', 'active', 'complete', 'closed');
  CREATE TYPE "cms"."enum__mod_feedback_settings_v_version_idea_stages_tone" AS ENUM('neutral', 'info', 'warning', 'success', 'destructive');
  CREATE TYPE "cms"."enum__mod_feedback_settings_v_version_score_factors_kind" AS ENUM('impact', 'effort');
  CREATE TYPE "cms"."enum__mod_feedback_settings_v_version_score_factors_source" AS ENUM('manual', 'votes', 'priority', 'tagVoters');
  CREATE TYPE "cms"."enum__mod_feedback_settings_v_version_score_factors_scale" AS ENUM('0-10', '0-100', 'fibonacci', 'stars', 'checkbox', 'percentage', 'number');
  CREATE TABLE "cms"."kit_modules_mod_feedback_idea_stages" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"key" varchar,
  	"type" "cms"."enum_kit_modules_mod_feedback_idea_stages_type" DEFAULT 'active',
  	"tone" "cms"."enum_kit_modules_mod_feedback_idea_stages_tone" DEFAULT 'info',
  	"portal_status" varchar,
  	"notify_voters" boolean DEFAULT true
  );
  
  CREATE TABLE "cms"."kit_modules_mod_feedback_score_factors" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"key" varchar,
  	"kind" "cms"."enum_kit_modules_mod_feedback_score_factors_kind" DEFAULT 'impact',
  	"weight" numeric DEFAULT 1,
  	"source" "cms"."enum_kit_modules_mod_feedback_score_factors_source" DEFAULT 'manual',
  	"scale" "cms"."enum_kit_modules_mod_feedback_score_factors_scale" DEFAULT '0-10'
  );
  
  CREATE TABLE "cms"."kit_modules_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "cms"."mod_feedback_settings_idea_stages" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"key" varchar,
  	"type" "cms"."enum_mod_feedback_settings_idea_stages_type" DEFAULT 'active' NOT NULL,
  	"tone" "cms"."enum_mod_feedback_settings_idea_stages_tone" DEFAULT 'info',
  	"portal_status" varchar,
  	"notify_voters" boolean DEFAULT true
  );
  
  CREATE TABLE "cms"."mod_feedback_settings_score_factors" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"key" varchar,
  	"kind" "cms"."enum_mod_feedback_settings_score_factors_kind" DEFAULT 'impact' NOT NULL,
  	"weight" numeric DEFAULT 1 NOT NULL,
  	"source" "cms"."enum_mod_feedback_settings_score_factors_source" DEFAULT 'manual' NOT NULL,
  	"scale" "cms"."enum_mod_feedback_settings_score_factors_scale" DEFAULT '0-10'
  );
  
  CREATE TABLE "cms"."mod_feedback_settings_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "cms"."_mod_feedback_settings_v_version_idea_stages" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"key" varchar,
  	"type" "cms"."enum__mod_feedback_settings_v_version_idea_stages_type" DEFAULT 'active' NOT NULL,
  	"tone" "cms"."enum__mod_feedback_settings_v_version_idea_stages_tone" DEFAULT 'info',
  	"portal_status" varchar,
  	"notify_voters" boolean DEFAULT true,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_mod_feedback_settings_v_version_score_factors" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"key" varchar,
  	"kind" "cms"."enum__mod_feedback_settings_v_version_score_factors_kind" DEFAULT 'impact' NOT NULL,
  	"weight" numeric DEFAULT 1 NOT NULL,
  	"source" "cms"."enum__mod_feedback_settings_v_version_score_factors_source" DEFAULT 'manual' NOT NULL,
  	"scale" "cms"."enum__mod_feedback_settings_v_version_score_factors_scale" DEFAULT '0-10',
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_mod_feedback_settings_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_eta_public_by_default" boolean DEFAULT false;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_vote_priorities" boolean DEFAULT true;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "eta_public_by_default" boolean DEFAULT false;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "vote_priorities" boolean DEFAULT true;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_eta_public_by_default" boolean DEFAULT false;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_vote_priorities" boolean DEFAULT true;
  ALTER TABLE "cms"."kit_modules_mod_feedback_idea_stages" ADD CONSTRAINT "kit_modules_mod_feedback_idea_stages_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."kit_modules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."kit_modules_mod_feedback_score_factors" ADD CONSTRAINT "kit_modules_mod_feedback_score_factors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."kit_modules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."kit_modules_texts" ADD CONSTRAINT "kit_modules_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."kit_modules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."mod_feedback_settings_idea_stages" ADD CONSTRAINT "mod_feedback_settings_idea_stages_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."mod_feedback_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."mod_feedback_settings_score_factors" ADD CONSTRAINT "mod_feedback_settings_score_factors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."mod_feedback_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."mod_feedback_settings_texts" ADD CONSTRAINT "mod_feedback_settings_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."mod_feedback_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_mod_feedback_settings_v_version_idea_stages" ADD CONSTRAINT "_mod_feedback_settings_v_version_idea_stages_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_mod_feedback_settings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_mod_feedback_settings_v_version_score_factors" ADD CONSTRAINT "_mod_feedback_settings_v_version_score_factors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_mod_feedback_settings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_mod_feedback_settings_v_texts" ADD CONSTRAINT "_mod_feedback_settings_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."_mod_feedback_settings_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "kit_modules_mod_feedback_idea_stages_order_idx" ON "cms"."kit_modules_mod_feedback_idea_stages" USING btree ("_order");
  CREATE INDEX "kit_modules_mod_feedback_idea_stages_parent_id_idx" ON "cms"."kit_modules_mod_feedback_idea_stages" USING btree ("_parent_id");
  CREATE INDEX "kit_modules_mod_feedback_score_factors_order_idx" ON "cms"."kit_modules_mod_feedback_score_factors" USING btree ("_order");
  CREATE INDEX "kit_modules_mod_feedback_score_factors_parent_id_idx" ON "cms"."kit_modules_mod_feedback_score_factors" USING btree ("_parent_id");
  CREATE INDEX "kit_modules_texts_order_parent" ON "cms"."kit_modules_texts" USING btree ("order","parent_id");
  CREATE INDEX "mod_feedback_settings_idea_stages_order_idx" ON "cms"."mod_feedback_settings_idea_stages" USING btree ("_order");
  CREATE INDEX "mod_feedback_settings_idea_stages_parent_id_idx" ON "cms"."mod_feedback_settings_idea_stages" USING btree ("_parent_id");
  CREATE INDEX "mod_feedback_settings_score_factors_order_idx" ON "cms"."mod_feedback_settings_score_factors" USING btree ("_order");
  CREATE INDEX "mod_feedback_settings_score_factors_parent_id_idx" ON "cms"."mod_feedback_settings_score_factors" USING btree ("_parent_id");
  CREATE INDEX "mod_feedback_settings_texts_order_parent" ON "cms"."mod_feedback_settings_texts" USING btree ("order","parent_id");
  CREATE INDEX "_mod_feedback_settings_v_version_idea_stages_order_idx" ON "cms"."_mod_feedback_settings_v_version_idea_stages" USING btree ("_order");
  CREATE INDEX "_mod_feedback_settings_v_version_idea_stages_parent_id_idx" ON "cms"."_mod_feedback_settings_v_version_idea_stages" USING btree ("_parent_id");
  CREATE INDEX "_mod_feedback_settings_v_version_score_factors_order_idx" ON "cms"."_mod_feedback_settings_v_version_score_factors" USING btree ("_order");
  CREATE INDEX "_mod_feedback_settings_v_version_score_factors_parent_id_idx" ON "cms"."_mod_feedback_settings_v_version_score_factors" USING btree ("_parent_id");
  CREATE INDEX "_mod_feedback_settings_v_texts_order_parent" ON "cms"."_mod_feedback_settings_v_texts" USING btree ("order","parent_id");`);
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "cms"."kit_modules_mod_feedback_idea_stages" CASCADE;
  DROP TABLE "cms"."kit_modules_mod_feedback_score_factors" CASCADE;
  DROP TABLE "cms"."kit_modules_texts" CASCADE;
  DROP TABLE "cms"."mod_feedback_settings_idea_stages" CASCADE;
  DROP TABLE "cms"."mod_feedback_settings_score_factors" CASCADE;
  DROP TABLE "cms"."mod_feedback_settings_texts" CASCADE;
  DROP TABLE "cms"."_mod_feedback_settings_v_version_idea_stages" CASCADE;
  DROP TABLE "cms"."_mod_feedback_settings_v_version_score_factors" CASCADE;
  DROP TABLE "cms"."_mod_feedback_settings_v_texts" CASCADE;
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_eta_public_by_default";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_vote_priorities";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "eta_public_by_default";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "vote_priorities";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_eta_public_by_default";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_vote_priorities";
  DROP TYPE "cms"."enum_kit_modules_mod_feedback_idea_stages_type";
  DROP TYPE "cms"."enum_kit_modules_mod_feedback_idea_stages_tone";
  DROP TYPE "cms"."enum_kit_modules_mod_feedback_score_factors_kind";
  DROP TYPE "cms"."enum_kit_modules_mod_feedback_score_factors_source";
  DROP TYPE "cms"."enum_kit_modules_mod_feedback_score_factors_scale";
  DROP TYPE "cms"."enum_mod_feedback_settings_idea_stages_type";
  DROP TYPE "cms"."enum_mod_feedback_settings_idea_stages_tone";
  DROP TYPE "cms"."enum_mod_feedback_settings_score_factors_kind";
  DROP TYPE "cms"."enum_mod_feedback_settings_score_factors_source";
  DROP TYPE "cms"."enum_mod_feedback_settings_score_factors_scale";
  DROP TYPE "cms"."enum__mod_feedback_settings_v_version_idea_stages_type";
  DROP TYPE "cms"."enum__mod_feedback_settings_v_version_idea_stages_tone";
  DROP TYPE "cms"."enum__mod_feedback_settings_v_version_score_factors_kind";
  DROP TYPE "cms"."enum__mod_feedback_settings_v_version_score_factors_source";
  DROP TYPE "cms"."enum__mod_feedback_settings_v_version_score_factors_scale";`);
}

import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_mod_feedback_changelog_type" AS ENUM('new', 'improved', 'fixed');
  CREATE TYPE "cms"."enum_mod_feedback_changelog_audience" AS ENUM('everyone', 'members');
  CREATE TYPE "cms"."enum_mod_feedback_changelog_status" AS ENUM('draft', 'published');
  CREATE TYPE "cms"."enum__mod_feedback_changelog_v_version_type" AS ENUM('new', 'improved', 'fixed');
  CREATE TYPE "cms"."enum__mod_feedback_changelog_v_version_audience" AS ENUM('everyone', 'members');
  CREATE TYPE "cms"."enum__mod_feedback_changelog_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "cms"."enum_mod_feedback_changelog_labels_tone" AS ENUM('neutral', 'info', 'warning', 'success', 'destructive');
  CREATE TABLE "cms"."mod_feedback_changelog" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"type" "cms"."enum_mod_feedback_changelog_type" DEFAULT 'new',
  	"excerpt" varchar,
  	"body" jsonb,
  	"hero_image_id" integer,
  	"audience" "cms"."enum_mod_feedback_changelog_audience" DEFAULT 'everyone',
  	"notify_subscribers" boolean DEFAULT true,
  	"published_at" timestamp(3) with time zone,
  	"announced_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "cms"."enum_mod_feedback_changelog_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "cms"."mod_feedback_changelog_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "cms"."mod_feedback_changelog_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"mod_feedback_changelog_labels_id" integer
  );
  
  CREATE TABLE "cms"."_mod_feedback_changelog_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_type" "cms"."enum__mod_feedback_changelog_v_version_type" DEFAULT 'new',
  	"version_excerpt" varchar,
  	"version_body" jsonb,
  	"version_hero_image_id" integer,
  	"version_audience" "cms"."enum__mod_feedback_changelog_v_version_audience" DEFAULT 'everyone',
  	"version_notify_subscribers" boolean DEFAULT true,
  	"version_published_at" timestamp(3) with time zone,
  	"version_announced_at" timestamp(3) with time zone,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "cms"."enum__mod_feedback_changelog_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "cms"."_mod_feedback_changelog_v_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "cms"."_mod_feedback_changelog_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"mod_feedback_changelog_labels_id" integer
  );
  
  CREATE TABLE "cms"."mod_feedback_changelog_labels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"_order" varchar,
  	"name" varchar NOT NULL,
  	"tone" "cms"."enum_mod_feedback_changelog_labels_tone" DEFAULT 'neutral',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_changelog_title" varchar DEFAULT 'Changelog';
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_changelog_subtitle" varchar DEFAULT 'Follow the latest improvements and updates.';
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_changelog_subscriptions" boolean DEFAULT true;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_changelog_rss" boolean DEFAULT true;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_changelog_reactions" boolean DEFAULT true;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_changelog_share" boolean DEFAULT true;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_changelog_ship_stage" varchar DEFAULT 'shipped';
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "changelog_title" varchar DEFAULT 'Changelog';
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "changelog_subtitle" varchar DEFAULT 'Follow the latest improvements and updates.';
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "changelog_subscriptions" boolean DEFAULT true;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "changelog_rss" boolean DEFAULT true;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "changelog_reactions" boolean DEFAULT true;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "changelog_share" boolean DEFAULT true;
  ALTER TABLE "cms"."mod_feedback_settings" ADD COLUMN "changelog_ship_stage" varchar DEFAULT 'shipped';
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_changelog_title" varchar DEFAULT 'Changelog';
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_changelog_subtitle" varchar DEFAULT 'Follow the latest improvements and updates.';
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_changelog_subscriptions" boolean DEFAULT true;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_changelog_rss" boolean DEFAULT true;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_changelog_reactions" boolean DEFAULT true;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_changelog_share" boolean DEFAULT true;
  ALTER TABLE "cms"."_mod_feedback_settings_v" ADD COLUMN "version_changelog_ship_stage" varchar DEFAULT 'shipped';
  ALTER TABLE "cms"."mod_feedback_changelog" ADD CONSTRAINT "mod_feedback_changelog_hero_image_id_media_id_fk" FOREIGN KEY ("hero_image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."mod_feedback_changelog_texts" ADD CONSTRAINT "mod_feedback_changelog_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."mod_feedback_changelog"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."mod_feedback_changelog_rels" ADD CONSTRAINT "mod_feedback_changelog_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."mod_feedback_changelog"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."mod_feedback_changelog_rels" ADD CONSTRAINT "mod_feedback_changelog_rels_mod_feedback_changelog_labels_fk" FOREIGN KEY ("mod_feedback_changelog_labels_id") REFERENCES "cms"."mod_feedback_changelog_labels"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_mod_feedback_changelog_v" ADD CONSTRAINT "_mod_feedback_changelog_v_parent_id_mod_feedback_changelog_id_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."mod_feedback_changelog"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_mod_feedback_changelog_v" ADD CONSTRAINT "_mod_feedback_changelog_v_version_hero_image_id_media_id_fk" FOREIGN KEY ("version_hero_image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_mod_feedback_changelog_v_texts" ADD CONSTRAINT "_mod_feedback_changelog_v_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."_mod_feedback_changelog_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_mod_feedback_changelog_v_rels" ADD CONSTRAINT "_mod_feedback_changelog_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."_mod_feedback_changelog_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_mod_feedback_changelog_v_rels" ADD CONSTRAINT "_mod_feedback_changelog_v_rels_mod_feedback_changelog_lab_fk" FOREIGN KEY ("mod_feedback_changelog_labels_id") REFERENCES "cms"."mod_feedback_changelog_labels"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "mod_feedback_changelog_slug_idx" ON "cms"."mod_feedback_changelog" USING btree ("slug");
  CREATE INDEX "mod_feedback_changelog_hero_image_idx" ON "cms"."mod_feedback_changelog" USING btree ("hero_image_id");
  CREATE INDEX "mod_feedback_changelog_updated_at_idx" ON "cms"."mod_feedback_changelog" USING btree ("updated_at");
  CREATE INDEX "mod_feedback_changelog_created_at_idx" ON "cms"."mod_feedback_changelog" USING btree ("created_at");
  CREATE INDEX "mod_feedback_changelog__status_idx" ON "cms"."mod_feedback_changelog" USING btree ("_status");
  CREATE INDEX "mod_feedback_changelog_texts_order_parent" ON "cms"."mod_feedback_changelog_texts" USING btree ("order","parent_id");
  CREATE INDEX "mod_feedback_changelog_rels_order_idx" ON "cms"."mod_feedback_changelog_rels" USING btree ("order");
  CREATE INDEX "mod_feedback_changelog_rels_parent_idx" ON "cms"."mod_feedback_changelog_rels" USING btree ("parent_id");
  CREATE INDEX "mod_feedback_changelog_rels_path_idx" ON "cms"."mod_feedback_changelog_rels" USING btree ("path");
  CREATE INDEX "mod_feedback_changelog_rels_mod_feedback_changelog_label_idx" ON "cms"."mod_feedback_changelog_rels" USING btree ("mod_feedback_changelog_labels_id");
  CREATE INDEX "_mod_feedback_changelog_v_parent_idx" ON "cms"."_mod_feedback_changelog_v" USING btree ("parent_id");
  CREATE INDEX "_mod_feedback_changelog_v_version_version_slug_idx" ON "cms"."_mod_feedback_changelog_v" USING btree ("version_slug");
  CREATE INDEX "_mod_feedback_changelog_v_version_version_hero_image_idx" ON "cms"."_mod_feedback_changelog_v" USING btree ("version_hero_image_id");
  CREATE INDEX "_mod_feedback_changelog_v_version_version_updated_at_idx" ON "cms"."_mod_feedback_changelog_v" USING btree ("version_updated_at");
  CREATE INDEX "_mod_feedback_changelog_v_version_version_created_at_idx" ON "cms"."_mod_feedback_changelog_v" USING btree ("version_created_at");
  CREATE INDEX "_mod_feedback_changelog_v_version_version__status_idx" ON "cms"."_mod_feedback_changelog_v" USING btree ("version__status");
  CREATE INDEX "_mod_feedback_changelog_v_created_at_idx" ON "cms"."_mod_feedback_changelog_v" USING btree ("created_at");
  CREATE INDEX "_mod_feedback_changelog_v_updated_at_idx" ON "cms"."_mod_feedback_changelog_v" USING btree ("updated_at");
  CREATE INDEX "_mod_feedback_changelog_v_latest_idx" ON "cms"."_mod_feedback_changelog_v" USING btree ("latest");
  CREATE INDEX "_mod_feedback_changelog_v_texts_order_parent" ON "cms"."_mod_feedback_changelog_v_texts" USING btree ("order","parent_id");
  CREATE INDEX "_mod_feedback_changelog_v_rels_order_idx" ON "cms"."_mod_feedback_changelog_v_rels" USING btree ("order");
  CREATE INDEX "_mod_feedback_changelog_v_rels_parent_idx" ON "cms"."_mod_feedback_changelog_v_rels" USING btree ("parent_id");
  CREATE INDEX "_mod_feedback_changelog_v_rels_path_idx" ON "cms"."_mod_feedback_changelog_v_rels" USING btree ("path");
  CREATE INDEX "_mod_feedback_changelog_v_rels_mod_feedback_changelog_la_idx" ON "cms"."_mod_feedback_changelog_v_rels" USING btree ("mod_feedback_changelog_labels_id");
  CREATE INDEX "mod_feedback_changelog_labels__order_idx" ON "cms"."mod_feedback_changelog_labels" USING btree ("_order");
  CREATE UNIQUE INDEX "mod_feedback_changelog_labels_name_idx" ON "cms"."mod_feedback_changelog_labels" USING btree ("name");
  CREATE INDEX "mod_feedback_changelog_labels_updated_at_idx" ON "cms"."mod_feedback_changelog_labels" USING btree ("updated_at");
  CREATE INDEX "mod_feedback_changelog_labels_created_at_idx" ON "cms"."mod_feedback_changelog_labels" USING btree ("created_at");`);
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "cms"."mod_feedback_changelog" CASCADE;
  DROP TABLE "cms"."mod_feedback_changelog_texts" CASCADE;
  DROP TABLE "cms"."mod_feedback_changelog_rels" CASCADE;
  DROP TABLE "cms"."_mod_feedback_changelog_v" CASCADE;
  DROP TABLE "cms"."_mod_feedback_changelog_v_texts" CASCADE;
  DROP TABLE "cms"."_mod_feedback_changelog_v_rels" CASCADE;
  DROP TABLE "cms"."mod_feedback_changelog_labels" CASCADE;
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_changelog_title";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_changelog_subtitle";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_changelog_subscriptions";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_changelog_rss";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_changelog_reactions";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_changelog_share";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_changelog_ship_stage";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "changelog_title";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "changelog_subtitle";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "changelog_subscriptions";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "changelog_rss";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "changelog_reactions";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "changelog_share";
  ALTER TABLE "cms"."mod_feedback_settings" DROP COLUMN "changelog_ship_stage";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_changelog_title";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_changelog_subtitle";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_changelog_subscriptions";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_changelog_rss";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_changelog_reactions";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_changelog_share";
  ALTER TABLE "cms"."_mod_feedback_settings_v" DROP COLUMN "version_changelog_ship_stage";
  DROP TYPE "cms"."enum_mod_feedback_changelog_type";
  DROP TYPE "cms"."enum_mod_feedback_changelog_audience";
  DROP TYPE "cms"."enum_mod_feedback_changelog_status";
  DROP TYPE "cms"."enum__mod_feedback_changelog_v_version_type";
  DROP TYPE "cms"."enum__mod_feedback_changelog_v_version_audience";
  DROP TYPE "cms"."enum__mod_feedback_changelog_v_version_status";
  DROP TYPE "cms"."enum_mod_feedback_changelog_labels_tone";`);
}

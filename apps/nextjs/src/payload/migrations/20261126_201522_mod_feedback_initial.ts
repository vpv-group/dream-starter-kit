// GENERATED copy (`pnpm mod sync`) of modules/feedback/src/payload/migrations/20261126_201522_mod_feedback_initial.ts
// so the local `payload migrate` CLI applies it — do not edit.
import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_kit_modules_mod_feedback_portal_tabs_tab" AS ENUM('roadmap', 'feedback', 'changelog');
  CREATE TYPE "cms"."enum_kit_modules_mod_feedback_statuses_type" AS ENUM('open', 'active', 'complete', 'closed');
  CREATE TYPE "cms"."enum_kit_modules_mod_feedback_statuses_tone" AS ENUM('neutral', 'info', 'warning', 'success', 'destructive');
  CREATE TYPE "cms"."enum_kit_modules_mod_feedback_tags_tone" AS ENUM('neutral', 'info', 'warning', 'success', 'destructive');
  CREATE TYPE "cms"."enum_kit_modules_mod_feedback_vote_milestones" AS ENUM('5', '10', '25', '50', '100', '250', '500', '1000');
  CREATE TYPE "cms"."enum_mod_feedback_boards_custom_fields_type" AS ENUM('text', 'textarea', 'select');
  CREATE TYPE "cms"."enum_mod_feedback_boards_access" AS ENUM('staff', 'public', 'members', 'segment');
  CREATE TYPE "cms"."enum_mod_feedback_boards_anon_votes" AS ENUM('inherit', 'allow', 'deny');
  CREATE TYPE "cms"."enum_mod_feedback_boards_anon_posts" AS ENUM('inherit', 'allow', 'deny');
  CREATE TYPE "cms"."enum_mod_feedback_boards_anon_comments" AS ENUM('inherit', 'allow', 'deny');
  CREATE TYPE "cms"."enum_mod_feedback_settings_portal_tabs_tab" AS ENUM('roadmap', 'feedback', 'changelog');
  CREATE TYPE "cms"."enum_mod_feedback_settings_statuses_type" AS ENUM('open', 'active', 'complete', 'closed');
  CREATE TYPE "cms"."enum_mod_feedback_settings_statuses_tone" AS ENUM('neutral', 'info', 'warning', 'success', 'destructive');
  CREATE TYPE "cms"."enum_mod_feedback_settings_tags_tone" AS ENUM('neutral', 'info', 'warning', 'success', 'destructive');
  CREATE TYPE "cms"."enum_mod_feedback_settings_vote_milestones" AS ENUM('5', '10', '25', '50', '100', '250', '500', '1000');
  CREATE TYPE "cms"."enum__mod_feedback_settings_v_version_portal_tabs_tab" AS ENUM('roadmap', 'feedback', 'changelog');
  CREATE TYPE "cms"."enum__mod_feedback_settings_v_version_statuses_type" AS ENUM('open', 'active', 'complete', 'closed');
  CREATE TYPE "cms"."enum__mod_feedback_settings_v_version_statuses_tone" AS ENUM('neutral', 'info', 'warning', 'success', 'destructive');
  CREATE TYPE "cms"."enum__mod_feedback_settings_v_version_tags_tone" AS ENUM('neutral', 'info', 'warning', 'success', 'destructive');
  CREATE TYPE "cms"."enum__mod_feedback_settings_v_version_vote_milestones" AS ENUM('5', '10', '25', '50', '100', '250', '500', '1000');
  CREATE TABLE "cms"."kit_modules_mod_feedback_portal_tabs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tab" "cms"."enum_kit_modules_mod_feedback_portal_tabs_tab",
  	"label" varchar,
  	"enabled" boolean DEFAULT true
  );
  
  CREATE TABLE "cms"."kit_modules_mod_feedback_statuses" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"key" varchar,
  	"type" "cms"."enum_kit_modules_mod_feedback_statuses_type" DEFAULT 'active',
  	"tone" "cms"."enum_kit_modules_mod_feedback_statuses_tone" DEFAULT 'info',
  	"show_on_roadmap" boolean DEFAULT false,
  	"is_default" boolean DEFAULT false,
  	"notify_voters_by_default" boolean DEFAULT true
  );
  
  CREATE TABLE "cms"."kit_modules_mod_feedback_tags" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"key" varchar,
  	"tone" "cms"."enum_kit_modules_mod_feedback_tags_tone" DEFAULT 'neutral'
  );
  
  CREATE TABLE "cms"."kit_modules_mod_feedback_vote_milestones" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "cms"."enum_kit_modules_mod_feedback_vote_milestones",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "cms"."mod_feedback_boards_custom_fields" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"key" varchar,
  	"required" boolean DEFAULT false,
  	"type" "cms"."enum_mod_feedback_boards_custom_fields_type" DEFAULT 'text',
  	"placeholder" varchar
  );
  
  CREATE TABLE "cms"."mod_feedback_boards_categories_subcategories" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"key" varchar
  );
  
  CREATE TABLE "cms"."mod_feedback_boards_categories" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"key" varchar
  );
  
  CREATE TABLE "cms"."mod_feedback_boards" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"_order" varchar,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"access" "cms"."enum_mod_feedback_boards_access" DEFAULT 'staff' NOT NULL,
  	"show_on_portal_home" boolean DEFAULT true,
  	"search_indexing" boolean DEFAULT false,
  	"allow_new_posts" boolean DEFAULT true,
  	"anon_votes" "cms"."enum_mod_feedback_boards_anon_votes" DEFAULT 'inherit',
  	"anon_posts" "cms"."enum_mod_feedback_boards_anon_posts" DEFAULT 'inherit',
  	"anon_comments" "cms"."enum_mod_feedback_boards_anon_comments" DEFAULT 'inherit',
  	"require_approval" boolean DEFAULT false,
  	"show_vote_counts" boolean DEFAULT true,
  	"show_voters" boolean DEFAULT true,
  	"show_dates" boolean DEFAULT true,
  	"show_comments_publicly" boolean DEFAULT true,
  	"disable_votes_when_done" boolean DEFAULT false,
  	"disable_comments_when_done" boolean DEFAULT false,
  	"title_label" varchar DEFAULT 'Title',
  	"title_placeholder" varchar DEFAULT 'Short, descriptive title',
  	"details_label" varchar DEFAULT 'Details',
  	"details_placeholder" varchar DEFAULT 'Any additional details…',
  	"submit_label" varchar DEFAULT 'Create Post',
  	"allow_attachments" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "cms"."mod_feedback_boards_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "cms"."mod_feedback_settings_portal_tabs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tab" "cms"."enum_mod_feedback_settings_portal_tabs_tab" NOT NULL,
  	"label" varchar NOT NULL,
  	"enabled" boolean DEFAULT true
  );
  
  CREATE TABLE "cms"."mod_feedback_settings_statuses" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"key" varchar,
  	"type" "cms"."enum_mod_feedback_settings_statuses_type" DEFAULT 'active' NOT NULL,
  	"tone" "cms"."enum_mod_feedback_settings_statuses_tone" DEFAULT 'info',
  	"show_on_roadmap" boolean DEFAULT false,
  	"is_default" boolean DEFAULT false,
  	"notify_voters_by_default" boolean DEFAULT true
  );
  
  CREATE TABLE "cms"."mod_feedback_settings_tags" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"key" varchar,
  	"tone" "cms"."enum_mod_feedback_settings_tags_tone" DEFAULT 'neutral'
  );
  
  CREATE TABLE "cms"."mod_feedback_settings_vote_milestones" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "cms"."enum_mod_feedback_settings_vote_milestones",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "cms"."mod_feedback_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"portal_title" varchar DEFAULT 'Feedback',
  	"feedback_intro" varchar DEFAULT 'Tell us what would make the product better.',
  	"search_all_boards" boolean DEFAULT true,
  	"stale_after_weeks" numeric DEFAULT 4,
  	"anon_votes" boolean DEFAULT true,
  	"anon_posts" boolean DEFAULT false,
  	"anon_comments" boolean DEFAULT false,
  	"posts_per_hour" numeric DEFAULT 10,
  	"comments_per_hour" numeric DEFAULT 30,
  	"notify_staff_on_new_post" boolean DEFAULT true,
  	"notify_voters_on_staff_comment" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "cms"."_mod_feedback_settings_v_version_portal_tabs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"tab" "cms"."enum__mod_feedback_settings_v_version_portal_tabs_tab" NOT NULL,
  	"label" varchar NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_mod_feedback_settings_v_version_statuses" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"key" varchar,
  	"type" "cms"."enum__mod_feedback_settings_v_version_statuses_type" DEFAULT 'active' NOT NULL,
  	"tone" "cms"."enum__mod_feedback_settings_v_version_statuses_tone" DEFAULT 'info',
  	"show_on_roadmap" boolean DEFAULT false,
  	"is_default" boolean DEFAULT false,
  	"notify_voters_by_default" boolean DEFAULT true,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_mod_feedback_settings_v_version_tags" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"key" varchar,
  	"tone" "cms"."enum__mod_feedback_settings_v_version_tags_tone" DEFAULT 'neutral',
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_mod_feedback_settings_v_version_vote_milestones" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "cms"."enum__mod_feedback_settings_v_version_vote_milestones",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "cms"."_mod_feedback_settings_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version_portal_title" varchar DEFAULT 'Feedback',
  	"version_feedback_intro" varchar DEFAULT 'Tell us what would make the product better.',
  	"version_search_all_boards" boolean DEFAULT true,
  	"version_stale_after_weeks" numeric DEFAULT 4,
  	"version_anon_votes" boolean DEFAULT true,
  	"version_anon_posts" boolean DEFAULT false,
  	"version_anon_comments" boolean DEFAULT false,
  	"version_posts_per_hour" numeric DEFAULT 10,
  	"version_comments_per_hour" numeric DEFAULT 30,
  	"version_notify_staff_on_new_post" boolean DEFAULT true,
  	"version_notify_voters_on_staff_comment" boolean DEFAULT true,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_portal_title" varchar DEFAULT 'Feedback';
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_feedback_intro" varchar DEFAULT 'Tell us what would make the product better.';
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_search_all_boards" boolean DEFAULT true;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_stale_after_weeks" numeric DEFAULT 4;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_anon_votes" boolean DEFAULT true;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_anon_posts" boolean DEFAULT false;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_anon_comments" boolean DEFAULT false;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_posts_per_hour" numeric DEFAULT 10;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_comments_per_hour" numeric DEFAULT 30;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_notify_staff_on_new_post" boolean DEFAULT true;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_feedback_notify_voters_on_staff_comment" boolean DEFAULT true;
  ALTER TABLE "cms"."kit_modules_mod_feedback_portal_tabs" ADD CONSTRAINT "kit_modules_mod_feedback_portal_tabs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."kit_modules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."kit_modules_mod_feedback_statuses" ADD CONSTRAINT "kit_modules_mod_feedback_statuses_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."kit_modules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."kit_modules_mod_feedback_tags" ADD CONSTRAINT "kit_modules_mod_feedback_tags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."kit_modules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."kit_modules_mod_feedback_vote_milestones" ADD CONSTRAINT "kit_modules_mod_feedback_vote_milestones_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."kit_modules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."mod_feedback_boards_custom_fields" ADD CONSTRAINT "mod_feedback_boards_custom_fields_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."mod_feedback_boards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."mod_feedback_boards_categories_subcategories" ADD CONSTRAINT "mod_feedback_boards_categories_subcategories_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."mod_feedback_boards_categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."mod_feedback_boards_categories" ADD CONSTRAINT "mod_feedback_boards_categories_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."mod_feedback_boards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."mod_feedback_boards_texts" ADD CONSTRAINT "mod_feedback_boards_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."mod_feedback_boards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."mod_feedback_settings_portal_tabs" ADD CONSTRAINT "mod_feedback_settings_portal_tabs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."mod_feedback_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."mod_feedback_settings_statuses" ADD CONSTRAINT "mod_feedback_settings_statuses_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."mod_feedback_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."mod_feedback_settings_tags" ADD CONSTRAINT "mod_feedback_settings_tags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."mod_feedback_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."mod_feedback_settings_vote_milestones" ADD CONSTRAINT "mod_feedback_settings_vote_milestones_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."mod_feedback_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_mod_feedback_settings_v_version_portal_tabs" ADD CONSTRAINT "_mod_feedback_settings_v_version_portal_tabs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_mod_feedback_settings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_mod_feedback_settings_v_version_statuses" ADD CONSTRAINT "_mod_feedback_settings_v_version_statuses_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_mod_feedback_settings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_mod_feedback_settings_v_version_tags" ADD CONSTRAINT "_mod_feedback_settings_v_version_tags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_mod_feedback_settings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_mod_feedback_settings_v_version_vote_milestones" ADD CONSTRAINT "_mod_feedback_settings_v_version_vote_milestones_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."_mod_feedback_settings_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "kit_modules_mod_feedback_portal_tabs_order_idx" ON "cms"."kit_modules_mod_feedback_portal_tabs" USING btree ("_order");
  CREATE INDEX "kit_modules_mod_feedback_portal_tabs_parent_id_idx" ON "cms"."kit_modules_mod_feedback_portal_tabs" USING btree ("_parent_id");
  CREATE INDEX "kit_modules_mod_feedback_statuses_order_idx" ON "cms"."kit_modules_mod_feedback_statuses" USING btree ("_order");
  CREATE INDEX "kit_modules_mod_feedback_statuses_parent_id_idx" ON "cms"."kit_modules_mod_feedback_statuses" USING btree ("_parent_id");
  CREATE INDEX "kit_modules_mod_feedback_tags_order_idx" ON "cms"."kit_modules_mod_feedback_tags" USING btree ("_order");
  CREATE INDEX "kit_modules_mod_feedback_tags_parent_id_idx" ON "cms"."kit_modules_mod_feedback_tags" USING btree ("_parent_id");
  CREATE INDEX "kit_modules_mod_feedback_vote_milestones_order_idx" ON "cms"."kit_modules_mod_feedback_vote_milestones" USING btree ("order");
  CREATE INDEX "kit_modules_mod_feedback_vote_milestones_parent_idx" ON "cms"."kit_modules_mod_feedback_vote_milestones" USING btree ("parent_id");
  CREATE INDEX "mod_feedback_boards_custom_fields_order_idx" ON "cms"."mod_feedback_boards_custom_fields" USING btree ("_order");
  CREATE INDEX "mod_feedback_boards_custom_fields_parent_id_idx" ON "cms"."mod_feedback_boards_custom_fields" USING btree ("_parent_id");
  CREATE INDEX "mod_feedback_boards_categories_subcategories_order_idx" ON "cms"."mod_feedback_boards_categories_subcategories" USING btree ("_order");
  CREATE INDEX "mod_feedback_boards_categories_subcategories_parent_id_idx" ON "cms"."mod_feedback_boards_categories_subcategories" USING btree ("_parent_id");
  CREATE INDEX "mod_feedback_boards_categories_order_idx" ON "cms"."mod_feedback_boards_categories" USING btree ("_order");
  CREATE INDEX "mod_feedback_boards_categories_parent_id_idx" ON "cms"."mod_feedback_boards_categories" USING btree ("_parent_id");
  CREATE INDEX "mod_feedback_boards__order_idx" ON "cms"."mod_feedback_boards" USING btree ("_order");
  CREATE UNIQUE INDEX "mod_feedback_boards_slug_idx" ON "cms"."mod_feedback_boards" USING btree ("slug");
  CREATE INDEX "mod_feedback_boards_updated_at_idx" ON "cms"."mod_feedback_boards" USING btree ("updated_at");
  CREATE INDEX "mod_feedback_boards_created_at_idx" ON "cms"."mod_feedback_boards" USING btree ("created_at");
  CREATE INDEX "mod_feedback_boards_texts_order_parent" ON "cms"."mod_feedback_boards_texts" USING btree ("order","parent_id");
  CREATE INDEX "mod_feedback_settings_portal_tabs_order_idx" ON "cms"."mod_feedback_settings_portal_tabs" USING btree ("_order");
  CREATE INDEX "mod_feedback_settings_portal_tabs_parent_id_idx" ON "cms"."mod_feedback_settings_portal_tabs" USING btree ("_parent_id");
  CREATE INDEX "mod_feedback_settings_statuses_order_idx" ON "cms"."mod_feedback_settings_statuses" USING btree ("_order");
  CREATE INDEX "mod_feedback_settings_statuses_parent_id_idx" ON "cms"."mod_feedback_settings_statuses" USING btree ("_parent_id");
  CREATE INDEX "mod_feedback_settings_tags_order_idx" ON "cms"."mod_feedback_settings_tags" USING btree ("_order");
  CREATE INDEX "mod_feedback_settings_tags_parent_id_idx" ON "cms"."mod_feedback_settings_tags" USING btree ("_parent_id");
  CREATE INDEX "mod_feedback_settings_vote_milestones_order_idx" ON "cms"."mod_feedback_settings_vote_milestones" USING btree ("order");
  CREATE INDEX "mod_feedback_settings_vote_milestones_parent_idx" ON "cms"."mod_feedback_settings_vote_milestones" USING btree ("parent_id");
  CREATE INDEX "_mod_feedback_settings_v_version_portal_tabs_order_idx" ON "cms"."_mod_feedback_settings_v_version_portal_tabs" USING btree ("_order");
  CREATE INDEX "_mod_feedback_settings_v_version_portal_tabs_parent_id_idx" ON "cms"."_mod_feedback_settings_v_version_portal_tabs" USING btree ("_parent_id");
  CREATE INDEX "_mod_feedback_settings_v_version_statuses_order_idx" ON "cms"."_mod_feedback_settings_v_version_statuses" USING btree ("_order");
  CREATE INDEX "_mod_feedback_settings_v_version_statuses_parent_id_idx" ON "cms"."_mod_feedback_settings_v_version_statuses" USING btree ("_parent_id");
  CREATE INDEX "_mod_feedback_settings_v_version_tags_order_idx" ON "cms"."_mod_feedback_settings_v_version_tags" USING btree ("_order");
  CREATE INDEX "_mod_feedback_settings_v_version_tags_parent_id_idx" ON "cms"."_mod_feedback_settings_v_version_tags" USING btree ("_parent_id");
  CREATE INDEX "_mod_feedback_settings_v_version_vote_milestones_order_idx" ON "cms"."_mod_feedback_settings_v_version_vote_milestones" USING btree ("order");
  CREATE INDEX "_mod_feedback_settings_v_version_vote_milestones_parent_idx" ON "cms"."_mod_feedback_settings_v_version_vote_milestones" USING btree ("parent_id");
  CREATE INDEX "_mod_feedback_settings_v_created_at_idx" ON "cms"."_mod_feedback_settings_v" USING btree ("created_at");
  CREATE INDEX "_mod_feedback_settings_v_updated_at_idx" ON "cms"."_mod_feedback_settings_v" USING btree ("updated_at");`);
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "cms"."kit_modules_mod_feedback_portal_tabs" CASCADE;
  DROP TABLE "cms"."kit_modules_mod_feedback_statuses" CASCADE;
  DROP TABLE "cms"."kit_modules_mod_feedback_tags" CASCADE;
  DROP TABLE "cms"."kit_modules_mod_feedback_vote_milestones" CASCADE;
  DROP TABLE "cms"."mod_feedback_boards_custom_fields" CASCADE;
  DROP TABLE "cms"."mod_feedback_boards_categories_subcategories" CASCADE;
  DROP TABLE "cms"."mod_feedback_boards_categories" CASCADE;
  DROP TABLE "cms"."mod_feedback_boards" CASCADE;
  DROP TABLE "cms"."mod_feedback_boards_texts" CASCADE;
  DROP TABLE "cms"."mod_feedback_settings_portal_tabs" CASCADE;
  DROP TABLE "cms"."mod_feedback_settings_statuses" CASCADE;
  DROP TABLE "cms"."mod_feedback_settings_tags" CASCADE;
  DROP TABLE "cms"."mod_feedback_settings_vote_milestones" CASCADE;
  DROP TABLE "cms"."mod_feedback_settings" CASCADE;
  DROP TABLE "cms"."_mod_feedback_settings_v_version_portal_tabs" CASCADE;
  DROP TABLE "cms"."_mod_feedback_settings_v_version_statuses" CASCADE;
  DROP TABLE "cms"."_mod_feedback_settings_v_version_tags" CASCADE;
  DROP TABLE "cms"."_mod_feedback_settings_v_version_vote_milestones" CASCADE;
  DROP TABLE "cms"."_mod_feedback_settings_v" CASCADE;
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_portal_title";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_feedback_intro";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_search_all_boards";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_stale_after_weeks";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_anon_votes";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_anon_posts";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_anon_comments";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_posts_per_hour";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_comments_per_hour";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_notify_staff_on_new_post";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_feedback_notify_voters_on_staff_comment";
  DROP TYPE "cms"."enum_kit_modules_mod_feedback_portal_tabs_tab";
  DROP TYPE "cms"."enum_kit_modules_mod_feedback_statuses_type";
  DROP TYPE "cms"."enum_kit_modules_mod_feedback_statuses_tone";
  DROP TYPE "cms"."enum_kit_modules_mod_feedback_tags_tone";
  DROP TYPE "cms"."enum_kit_modules_mod_feedback_vote_milestones";
  DROP TYPE "cms"."enum_mod_feedback_boards_custom_fields_type";
  DROP TYPE "cms"."enum_mod_feedback_boards_access";
  DROP TYPE "cms"."enum_mod_feedback_boards_anon_votes";
  DROP TYPE "cms"."enum_mod_feedback_boards_anon_posts";
  DROP TYPE "cms"."enum_mod_feedback_boards_anon_comments";
  DROP TYPE "cms"."enum_mod_feedback_settings_portal_tabs_tab";
  DROP TYPE "cms"."enum_mod_feedback_settings_statuses_type";
  DROP TYPE "cms"."enum_mod_feedback_settings_statuses_tone";
  DROP TYPE "cms"."enum_mod_feedback_settings_tags_tone";
  DROP TYPE "cms"."enum_mod_feedback_settings_vote_milestones";
  DROP TYPE "cms"."enum__mod_feedback_settings_v_version_portal_tabs_tab";
  DROP TYPE "cms"."enum__mod_feedback_settings_v_version_statuses_type";
  DROP TYPE "cms"."enum__mod_feedback_settings_v_version_statuses_tone";
  DROP TYPE "cms"."enum__mod_feedback_settings_v_version_tags_tone";
  DROP TYPE "cms"."enum__mod_feedback_settings_v_version_vote_milestones";`);
}

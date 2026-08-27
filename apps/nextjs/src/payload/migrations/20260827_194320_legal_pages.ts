import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_legal_status" AS ENUM('draft', 'published');
  CREATE TYPE "cms"."enum__legal_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "cms"."legal" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"content" jsonb,
  	"effective_date" timestamp(3) with time zone,
  	"order" numeric DEFAULT 0,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"deleted_at" timestamp(3) with time zone,
  	"_status" "cms"."enum_legal_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "cms"."_legal_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_content" jsonb,
  	"version_effective_date" timestamp(3) with time zone,
  	"version_order" numeric DEFAULT 0,
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_meta_image_id" integer,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_deleted_at" timestamp(3) with time zone,
  	"version__status" "cms"."enum__legal_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_background" SET DEFAULT 'oklch(1 0 0)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_foreground" SET DEFAULT 'oklch(0.13 0.02 270)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_card_foreground" SET DEFAULT 'oklch(0.13 0.02 270)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_popover_foreground" SET DEFAULT 'oklch(0.13 0.02 270)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_primary" SET DEFAULT 'oklch(0.53 0.24 264)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_secondary" SET DEFAULT 'oklch(0.98 0.006 250)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_secondary_foreground" SET DEFAULT 'oklch(0.13 0.02 270)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_muted" SET DEFAULT 'oklch(0.98 0.006 250)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_muted_foreground" SET DEFAULT 'oklch(0.55 0.02 257)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_accent" SET DEFAULT 'oklch(0.98 0.006 250)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_accent_foreground" SET DEFAULT 'oklch(0.13 0.02 270)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_destructive" SET DEFAULT 'oklch(0.6 0.22 27)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_border" SET DEFAULT 'oklch(0.92 0.008 255)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_input" SET DEFAULT 'oklch(0.92 0.008 255)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_ring" SET DEFAULT 'oklch(0.53 0.24 264)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_chart1" SET DEFAULT 'oklch(0.53 0.24 264)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_chart2" SET DEFAULT 'oklch(0.79 0.11 220)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_chart3" SET DEFAULT 'oklch(0.74 0.15 295)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_chart4" SET DEFAULT 'oklch(0.78 0.13 55)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_chart5" SET DEFAULT 'oklch(0.67 0.15 264)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_sidebar" SET DEFAULT 'oklch(0.98 0.006 250)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_sidebar_foreground" SET DEFAULT 'oklch(0.32 0.03 265)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_sidebar_primary" SET DEFAULT 'oklch(0.53 0.24 264)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_sidebar_accent" SET DEFAULT 'oklch(0.92 0.008 255)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_sidebar_accent_foreground" SET DEFAULT 'oklch(0.53 0.24 264)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_sidebar_border" SET DEFAULT 'oklch(0.92 0.008 255)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_sidebar_ring" SET DEFAULT 'oklch(0.53 0.24 264)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_brand" SET DEFAULT 'oklch(0.53 0.24 264)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_brand_foreground" SET DEFAULT 'oklch(0.7 0.18 264)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_background" SET DEFAULT 'oklch(0.14 0.025 268)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_foreground" SET DEFAULT 'oklch(0.96 0.008 260)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_card" SET DEFAULT 'oklch(0.18 0.03 268)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_card_foreground" SET DEFAULT 'oklch(0.96 0.008 260)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_popover" SET DEFAULT 'oklch(0.18 0.03 268)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_popover_foreground" SET DEFAULT 'oklch(0.96 0.008 260)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_primary" SET DEFAULT 'oklch(0.62 0.21 264)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_secondary" SET DEFAULT 'oklch(0.22 0.035 266)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_secondary_foreground" SET DEFAULT 'oklch(0.9 0.012 260)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_muted" SET DEFAULT 'oklch(0.22 0.035 266)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_muted_foreground" SET DEFAULT 'oklch(0.7 0.018 258)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_accent" SET DEFAULT 'oklch(0.22 0.035 266)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_accent_foreground" SET DEFAULT 'oklch(0.75 0.14 264)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_destructive" SET DEFAULT 'oklch(0.5 0.19 26)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_border" SET DEFAULT 'oklch(0.27 0.03 266)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_input" SET DEFAULT 'oklch(0.24 0.03 266)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_ring" SET DEFAULT 'oklch(0.62 0.21 264)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_chart1" SET DEFAULT 'oklch(0.68 0.17 264)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_chart2" SET DEFAULT 'oklch(0.75 0.11 220)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_chart3" SET DEFAULT 'oklch(0.7 0.15 295)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_chart4" SET DEFAULT 'oklch(0.75 0.13 55)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_chart5" SET DEFAULT 'oklch(0.55 0.19 264)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_sidebar" SET DEFAULT 'oklch(0.16 0.028 268)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_sidebar_foreground" SET DEFAULT 'oklch(0.85 0.012 260)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_sidebar_primary" SET DEFAULT 'oklch(0.62 0.21 264)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_sidebar_accent" SET DEFAULT 'oklch(0.22 0.035 266)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_sidebar_accent_foreground" SET DEFAULT 'oklch(0.75 0.14 264)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_sidebar_border" SET DEFAULT 'oklch(0.27 0.03 266)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_sidebar_ring" SET DEFAULT 'oklch(0.62 0.21 264)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_brand" SET DEFAULT 'oklch(0.68 0.17 264)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_brand_foreground" SET DEFAULT 'oklch(0.8 0.12 264)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "font_sans" SET DEFAULT 'inter';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_background" SET DEFAULT 'oklch(1 0 0)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_foreground" SET DEFAULT 'oklch(0.13 0.02 270)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_card_foreground" SET DEFAULT 'oklch(0.13 0.02 270)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_popover_foreground" SET DEFAULT 'oklch(0.13 0.02 270)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_primary" SET DEFAULT 'oklch(0.53 0.24 264)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_secondary" SET DEFAULT 'oklch(0.98 0.006 250)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_secondary_foreground" SET DEFAULT 'oklch(0.13 0.02 270)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_muted" SET DEFAULT 'oklch(0.98 0.006 250)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_muted_foreground" SET DEFAULT 'oklch(0.55 0.02 257)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_accent" SET DEFAULT 'oklch(0.98 0.006 250)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_accent_foreground" SET DEFAULT 'oklch(0.13 0.02 270)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_destructive" SET DEFAULT 'oklch(0.6 0.22 27)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_border" SET DEFAULT 'oklch(0.92 0.008 255)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_input" SET DEFAULT 'oklch(0.92 0.008 255)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_ring" SET DEFAULT 'oklch(0.53 0.24 264)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_chart1" SET DEFAULT 'oklch(0.53 0.24 264)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_chart2" SET DEFAULT 'oklch(0.79 0.11 220)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_chart3" SET DEFAULT 'oklch(0.74 0.15 295)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_chart4" SET DEFAULT 'oklch(0.78 0.13 55)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_chart5" SET DEFAULT 'oklch(0.67 0.15 264)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_sidebar" SET DEFAULT 'oklch(0.98 0.006 250)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_sidebar_foreground" SET DEFAULT 'oklch(0.32 0.03 265)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_sidebar_primary" SET DEFAULT 'oklch(0.53 0.24 264)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_sidebar_accent" SET DEFAULT 'oklch(0.92 0.008 255)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_sidebar_accent_foreground" SET DEFAULT 'oklch(0.53 0.24 264)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_sidebar_border" SET DEFAULT 'oklch(0.92 0.008 255)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_sidebar_ring" SET DEFAULT 'oklch(0.53 0.24 264)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_brand" SET DEFAULT 'oklch(0.53 0.24 264)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_brand_foreground" SET DEFAULT 'oklch(0.7 0.18 264)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_background" SET DEFAULT 'oklch(0.14 0.025 268)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_foreground" SET DEFAULT 'oklch(0.96 0.008 260)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_card" SET DEFAULT 'oklch(0.18 0.03 268)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_card_foreground" SET DEFAULT 'oklch(0.96 0.008 260)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_popover" SET DEFAULT 'oklch(0.18 0.03 268)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_popover_foreground" SET DEFAULT 'oklch(0.96 0.008 260)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_primary" SET DEFAULT 'oklch(0.62 0.21 264)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_secondary" SET DEFAULT 'oklch(0.22 0.035 266)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_secondary_foreground" SET DEFAULT 'oklch(0.9 0.012 260)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_muted" SET DEFAULT 'oklch(0.22 0.035 266)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_muted_foreground" SET DEFAULT 'oklch(0.7 0.018 258)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_accent" SET DEFAULT 'oklch(0.22 0.035 266)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_accent_foreground" SET DEFAULT 'oklch(0.75 0.14 264)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_destructive" SET DEFAULT 'oklch(0.5 0.19 26)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_border" SET DEFAULT 'oklch(0.27 0.03 266)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_input" SET DEFAULT 'oklch(0.24 0.03 266)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_ring" SET DEFAULT 'oklch(0.62 0.21 264)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_chart1" SET DEFAULT 'oklch(0.68 0.17 264)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_chart2" SET DEFAULT 'oklch(0.75 0.11 220)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_chart3" SET DEFAULT 'oklch(0.7 0.15 295)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_chart4" SET DEFAULT 'oklch(0.75 0.13 55)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_chart5" SET DEFAULT 'oklch(0.55 0.19 264)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_sidebar" SET DEFAULT 'oklch(0.16 0.028 268)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_sidebar_foreground" SET DEFAULT 'oklch(0.85 0.012 260)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_sidebar_primary" SET DEFAULT 'oklch(0.62 0.21 264)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_sidebar_accent" SET DEFAULT 'oklch(0.22 0.035 266)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_sidebar_accent_foreground" SET DEFAULT 'oklch(0.75 0.14 264)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_sidebar_border" SET DEFAULT 'oklch(0.27 0.03 266)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_sidebar_ring" SET DEFAULT 'oklch(0.62 0.21 264)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_brand" SET DEFAULT 'oklch(0.68 0.17 264)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_brand_foreground" SET DEFAULT 'oklch(0.8 0.12 264)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_font_sans" SET DEFAULT 'inter';
  ALTER TABLE "cms"."authentication_settings" ALTER COLUMN "terms_url" SET DEFAULT '/legal/terms-of-service';
  ALTER TABLE "cms"."authentication_settings" ALTER COLUMN "privacy_url" SET DEFAULT '/legal/privacy-policy';
  ALTER TABLE "cms"."legal" ADD CONSTRAINT "legal_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_legal_v" ADD CONSTRAINT "_legal_v_parent_id_legal_id_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."legal"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_legal_v" ADD CONSTRAINT "_legal_v_version_meta_image_id_media_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "cms"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "legal_slug_idx" ON "cms"."legal" USING btree ("slug");
  CREATE INDEX "legal_meta_meta_image_idx" ON "cms"."legal" USING btree ("meta_image_id");
  CREATE INDEX "legal_updated_at_idx" ON "cms"."legal" USING btree ("updated_at");
  CREATE INDEX "legal_created_at_idx" ON "cms"."legal" USING btree ("created_at");
  CREATE INDEX "legal_deleted_at_idx" ON "cms"."legal" USING btree ("deleted_at");
  CREATE INDEX "legal__status_idx" ON "cms"."legal" USING btree ("_status");
  CREATE INDEX "_legal_v_parent_idx" ON "cms"."_legal_v" USING btree ("parent_id");
  CREATE INDEX "_legal_v_version_version_slug_idx" ON "cms"."_legal_v" USING btree ("version_slug");
  CREATE INDEX "_legal_v_version_meta_version_meta_image_idx" ON "cms"."_legal_v" USING btree ("version_meta_image_id");
  CREATE INDEX "_legal_v_version_version_updated_at_idx" ON "cms"."_legal_v" USING btree ("version_updated_at");
  CREATE INDEX "_legal_v_version_version_created_at_idx" ON "cms"."_legal_v" USING btree ("version_created_at");
  CREATE INDEX "_legal_v_version_version_deleted_at_idx" ON "cms"."_legal_v" USING btree ("version_deleted_at");
  CREATE INDEX "_legal_v_version_version__status_idx" ON "cms"."_legal_v" USING btree ("version__status");
  CREATE INDEX "_legal_v_created_at_idx" ON "cms"."_legal_v" USING btree ("created_at");
  CREATE INDEX "_legal_v_updated_at_idx" ON "cms"."_legal_v" USING btree ("updated_at");
  CREATE INDEX "_legal_v_latest_idx" ON "cms"."_legal_v" USING btree ("latest");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."legal" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_legal_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "cms"."legal" CASCADE;
  DROP TABLE "cms"."_legal_v" CASCADE;
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_background" SET DEFAULT 'oklch(0.9875 0.0045 314.8053)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_foreground" SET DEFAULT 'oklch(0.2277 0.0105 312.0161)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_card_foreground" SET DEFAULT 'oklch(0.2277 0.0105 312.0161)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_popover_foreground" SET DEFAULT 'oklch(0.2277 0.0105 312.0161)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_primary" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_secondary" SET DEFAULT 'oklch(0.967 0.0106 316.4921)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_secondary_foreground" SET DEFAULT 'oklch(0.4536 0.0226 309.5036)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_muted" SET DEFAULT 'oklch(0.967 0.0106 316.4921)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_muted_foreground" SET DEFAULT 'oklch(0.5653 0.021 306.4429)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_accent" SET DEFAULT 'oklch(0.967 0.0106 316.4921)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_accent_foreground" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_destructive" SET DEFAULT 'oklch(0.6368 0.2078 25.3313)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_border" SET DEFAULT 'oklch(0.9419 0.016 310.0997)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_input" SET DEFAULT 'oklch(1 0 0)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_ring" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_chart1" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_chart2" SET DEFAULT 'oklch(0.6747 0.1492 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_chart3" SET DEFAULT 'oklch(0.7729 0.1045 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_chart4" SET DEFAULT 'oklch(0.8625 0.0636 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_chart5" SET DEFAULT 'oklch(0.9411 0.0261 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_sidebar" SET DEFAULT 'oklch(0.967 0.0106 316.4921)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_sidebar_foreground" SET DEFAULT 'oklch(0.4536 0.0226 309.5036)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_sidebar_primary" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_sidebar_accent" SET DEFAULT 'oklch(0.9419 0.016 310.0997)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_sidebar_accent_foreground" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_sidebar_border" SET DEFAULT 'oklch(0.9155 0.0235 310.6964)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_sidebar_ring" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_brand" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_light_brand_foreground" SET DEFAULT 'oklch(0.7039 0.1825 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_background" SET DEFAULT 'oklch(0.1836 0.0111 311.9111)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_foreground" SET DEFAULT 'oklch(0.9788 0.0057 308.3962)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_card" SET DEFAULT 'oklch(0.1836 0.0111 311.9111)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_card_foreground" SET DEFAULT 'oklch(0.9788 0.0057 308.3962)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_popover" SET DEFAULT 'oklch(0.1836 0.0111 311.9111)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_popover_foreground" SET DEFAULT 'oklch(0.9788 0.0057 308.3962)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_primary" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_secondary" SET DEFAULT 'oklch(0.2551 0.0142 310.7968)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_secondary_foreground" SET DEFAULT 'oklch(0.721 0.0184 308.1777)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_muted" SET DEFAULT 'oklch(0.2551 0.0142 310.7968)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_muted_foreground" SET DEFAULT 'oklch(0.6288 0.0177 309.9946)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_accent" SET DEFAULT 'oklch(0.2551 0.0142 310.7968)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_accent_foreground" SET DEFAULT 'oklch(0.6747 0.1492 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_destructive" SET DEFAULT 'oklch(0.3958 0.1331 25.723)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_border" SET DEFAULT 'oklch(0.2941 0.0175 310.1142)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_input" SET DEFAULT 'oklch(0.2551 0.0142 310.7968)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_ring" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_chart1" SET DEFAULT 'oklch(0.6747 0.1492 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_chart2" SET DEFAULT 'oklch(0.5605 0.1911 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_chart3" SET DEFAULT 'oklch(0.4988 0.1668 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_chart4" SET DEFAULT 'oklch(0.4373 0.1428 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_chart5" SET DEFAULT 'oklch(0.3738 0.1177 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_sidebar" SET DEFAULT 'oklch(0.2103 0.0107 311.9806)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_sidebar_foreground" SET DEFAULT 'oklch(0.721 0.0184 308.1777)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_sidebar_primary" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_sidebar_accent" SET DEFAULT 'oklch(0.2551 0.0142 310.7968)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_sidebar_accent_foreground" SET DEFAULT 'oklch(0.6747 0.1492 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_sidebar_border" SET DEFAULT 'oklch(0.2941 0.0175 310.1142)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_sidebar_ring" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_brand" SET DEFAULT 'oklch(0.6747 0.1492 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "colors_dark_brand_foreground" SET DEFAULT 'oklch(0.8 0.12 264.19)';
  ALTER TABLE "cms"."theme_settings" ALTER COLUMN "font_sans" SET DEFAULT 'geist';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_background" SET DEFAULT 'oklch(0.9875 0.0045 314.8053)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_foreground" SET DEFAULT 'oklch(0.2277 0.0105 312.0161)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_card_foreground" SET DEFAULT 'oklch(0.2277 0.0105 312.0161)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_popover_foreground" SET DEFAULT 'oklch(0.2277 0.0105 312.0161)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_primary" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_secondary" SET DEFAULT 'oklch(0.967 0.0106 316.4921)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_secondary_foreground" SET DEFAULT 'oklch(0.4536 0.0226 309.5036)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_muted" SET DEFAULT 'oklch(0.967 0.0106 316.4921)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_muted_foreground" SET DEFAULT 'oklch(0.5653 0.021 306.4429)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_accent" SET DEFAULT 'oklch(0.967 0.0106 316.4921)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_accent_foreground" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_destructive" SET DEFAULT 'oklch(0.6368 0.2078 25.3313)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_border" SET DEFAULT 'oklch(0.9419 0.016 310.0997)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_input" SET DEFAULT 'oklch(1 0 0)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_ring" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_chart1" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_chart2" SET DEFAULT 'oklch(0.6747 0.1492 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_chart3" SET DEFAULT 'oklch(0.7729 0.1045 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_chart4" SET DEFAULT 'oklch(0.8625 0.0636 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_chart5" SET DEFAULT 'oklch(0.9411 0.0261 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_sidebar" SET DEFAULT 'oklch(0.967 0.0106 316.4921)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_sidebar_foreground" SET DEFAULT 'oklch(0.4536 0.0226 309.5036)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_sidebar_primary" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_sidebar_accent" SET DEFAULT 'oklch(0.9419 0.016 310.0997)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_sidebar_accent_foreground" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_sidebar_border" SET DEFAULT 'oklch(0.9155 0.0235 310.6964)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_sidebar_ring" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_brand" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_light_brand_foreground" SET DEFAULT 'oklch(0.7039 0.1825 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_background" SET DEFAULT 'oklch(0.1836 0.0111 311.9111)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_foreground" SET DEFAULT 'oklch(0.9788 0.0057 308.3962)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_card" SET DEFAULT 'oklch(0.1836 0.0111 311.9111)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_card_foreground" SET DEFAULT 'oklch(0.9788 0.0057 308.3962)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_popover" SET DEFAULT 'oklch(0.1836 0.0111 311.9111)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_popover_foreground" SET DEFAULT 'oklch(0.9788 0.0057 308.3962)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_primary" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_secondary" SET DEFAULT 'oklch(0.2551 0.0142 310.7968)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_secondary_foreground" SET DEFAULT 'oklch(0.721 0.0184 308.1777)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_muted" SET DEFAULT 'oklch(0.2551 0.0142 310.7968)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_muted_foreground" SET DEFAULT 'oklch(0.6288 0.0177 309.9946)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_accent" SET DEFAULT 'oklch(0.2551 0.0142 310.7968)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_accent_foreground" SET DEFAULT 'oklch(0.6747 0.1492 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_destructive" SET DEFAULT 'oklch(0.3958 0.1331 25.723)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_border" SET DEFAULT 'oklch(0.2941 0.0175 310.1142)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_input" SET DEFAULT 'oklch(0.2551 0.0142 310.7968)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_ring" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_chart1" SET DEFAULT 'oklch(0.6747 0.1492 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_chart2" SET DEFAULT 'oklch(0.5605 0.1911 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_chart3" SET DEFAULT 'oklch(0.4988 0.1668 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_chart4" SET DEFAULT 'oklch(0.4373 0.1428 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_chart5" SET DEFAULT 'oklch(0.3738 0.1177 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_sidebar" SET DEFAULT 'oklch(0.2103 0.0107 311.9806)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_sidebar_foreground" SET DEFAULT 'oklch(0.721 0.0184 308.1777)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_sidebar_primary" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_sidebar_accent" SET DEFAULT 'oklch(0.2551 0.0142 310.7968)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_sidebar_accent_foreground" SET DEFAULT 'oklch(0.6747 0.1492 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_sidebar_border" SET DEFAULT 'oklch(0.2941 0.0175 310.1142)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_sidebar_ring" SET DEFAULT 'oklch(0.533 0.236 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_brand" SET DEFAULT 'oklch(0.6747 0.1492 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_colors_dark_brand_foreground" SET DEFAULT 'oklch(0.8 0.12 264.19)';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_font_sans" SET DEFAULT 'geist';
  ALTER TABLE "cms"."authentication_settings" ALTER COLUMN "terms_url" SET DEFAULT '/terms';
  ALTER TABLE "cms"."authentication_settings" ALTER COLUMN "privacy_url" SET DEFAULT '/privacy';
  DROP TYPE "cms"."enum_legal_status";
  DROP TYPE "cms"."enum__legal_v_version_status";`)
}

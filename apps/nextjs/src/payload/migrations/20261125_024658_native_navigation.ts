import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_native_navigation_tab_count" AS ENUM('3', '4');
  CREATE TYPE "cms"."enum_native_navigation_status" AS ENUM('draft', 'published');
  CREATE TYPE "cms"."enum__native_navigation_v_version_tab_count" AS ENUM('3', '4');
  CREATE TYPE "cms"."enum__native_navigation_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "cms"."native_navigation_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"item_id" integer,
  	"hidden" boolean DEFAULT false,
  	"sf_symbol" varchar,
  	"material_icon" varchar
  );
  
  CREATE TABLE "cms"."native_navigation" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tab_count" "cms"."enum_native_navigation_tab_count" DEFAULT '4',
  	"_status" "cms"."enum_native_navigation_status" DEFAULT 'draft',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "cms"."_native_navigation_v_version_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"item_id" integer,
  	"hidden" boolean DEFAULT false,
  	"sf_symbol" varchar,
  	"material_icon" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "cms"."_native_navigation_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version_tab_count" "cms"."enum__native_navigation_v_version_tab_count" DEFAULT '4',
  	"version__status" "cms"."enum__native_navigation_v_version_status" DEFAULT 'draft',
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  ALTER TABLE "cms"."kit_modules" ALTER COLUMN "slug" DROP NOT NULL;
  ALTER TABLE "cms"."kit_modules" ALTER COLUMN "name" DROP NOT NULL;
  ALTER TABLE "cms"."kit_modules" ALTER COLUMN "version" DROP NOT NULL;
  ALTER TABLE "cms"."native_navigation_items" ADD CONSTRAINT "native_navigation_items_item_id_nav_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "cms"."nav_items"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."native_navigation_items" ADD CONSTRAINT "native_navigation_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."native_navigation"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_native_navigation_v_version_items" ADD CONSTRAINT "_native_navigation_v_version_items_item_id_nav_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "cms"."nav_items"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "cms"."_native_navigation_v_version_items" ADD CONSTRAINT "_native_navigation_v_version_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_native_navigation_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "native_navigation_items_order_idx" ON "cms"."native_navigation_items" USING btree ("_order");
  CREATE INDEX "native_navigation_items_parent_id_idx" ON "cms"."native_navigation_items" USING btree ("_parent_id");
  CREATE INDEX "native_navigation_items_item_idx" ON "cms"."native_navigation_items" USING btree ("item_id");
  CREATE INDEX "native_navigation__status_idx" ON "cms"."native_navigation" USING btree ("_status");
  CREATE INDEX "_native_navigation_v_version_items_order_idx" ON "cms"."_native_navigation_v_version_items" USING btree ("_order");
  CREATE INDEX "_native_navigation_v_version_items_parent_id_idx" ON "cms"."_native_navigation_v_version_items" USING btree ("_parent_id");
  CREATE INDEX "_native_navigation_v_version_items_item_idx" ON "cms"."_native_navigation_v_version_items" USING btree ("item_id");
  CREATE INDEX "_native_navigation_v_version_version__status_idx" ON "cms"."_native_navigation_v" USING btree ("version__status");
  CREATE INDEX "_native_navigation_v_created_at_idx" ON "cms"."_native_navigation_v" USING btree ("created_at");
  CREATE INDEX "_native_navigation_v_updated_at_idx" ON "cms"."_native_navigation_v" USING btree ("updated_at");
  CREATE INDEX "_native_navigation_v_latest_idx" ON "cms"."_native_navigation_v" USING btree ("latest");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."native_navigation_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."native_navigation" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_native_navigation_v_version_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."_native_navigation_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "cms"."native_navigation_items" CASCADE;
  DROP TABLE "cms"."native_navigation" CASCADE;
  DROP TABLE "cms"."_native_navigation_v_version_items" CASCADE;
  DROP TABLE "cms"."_native_navigation_v" CASCADE;
  ALTER TABLE "cms"."kit_modules" ALTER COLUMN "slug" SET NOT NULL;
  ALTER TABLE "cms"."kit_modules" ALTER COLUMN "name" SET NOT NULL;
  ALTER TABLE "cms"."kit_modules" ALTER COLUMN "version" SET NOT NULL;
  DROP TYPE "cms"."enum_native_navigation_tab_count";
  DROP TYPE "cms"."enum_native_navigation_status";
  DROP TYPE "cms"."enum__native_navigation_v_version_tab_count";
  DROP TYPE "cms"."enum__native_navigation_v_version_status";`)
}

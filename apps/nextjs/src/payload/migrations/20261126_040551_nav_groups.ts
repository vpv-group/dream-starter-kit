import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_nav_items_kind" AS ENUM('link', 'group');
  ALTER TYPE "cms"."enum_nav_items_audience" ADD VALUE 'members';
  ALTER TABLE "cms"."nav_items" ALTER COLUMN "href" DROP NOT NULL;
  ALTER TABLE "cms"."nav_items" ADD COLUMN "kind" "cms"."enum_nav_items_kind" DEFAULT 'link';
  ALTER TABLE "cms"."nav_items" ADD COLUMN "parent_id" integer;
  ALTER TABLE "cms"."nav_items" ADD CONSTRAINT "nav_items_parent_id_nav_items_id_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."nav_items"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "nav_items_parent_idx" ON "cms"."nav_items" USING btree ("parent_id");`);
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."nav_items" DROP CONSTRAINT "nav_items_parent_id_nav_items_id_fk";
  
  ALTER TABLE "cms"."nav_items" ALTER COLUMN "audience" SET DATA TYPE text;
  ALTER TABLE "cms"."nav_items" ALTER COLUMN "audience" SET DEFAULT 'everyone'::text;
  DROP TYPE "cms"."enum_nav_items_audience";
  CREATE TYPE "cms"."enum_nav_items_audience" AS ENUM('everyone', 'staff');
  ALTER TABLE "cms"."nav_items" ALTER COLUMN "audience" SET DEFAULT 'everyone'::"cms"."enum_nav_items_audience";
  ALTER TABLE "cms"."nav_items" ALTER COLUMN "audience" SET DATA TYPE "cms"."enum_nav_items_audience" USING "audience"::"cms"."enum_nav_items_audience";
  DROP INDEX "cms"."nav_items_parent_idx";
  ALTER TABLE "cms"."nav_items" ALTER COLUMN "href" SET NOT NULL;
  ALTER TABLE "cms"."nav_items" DROP COLUMN "kind";
  ALTER TABLE "cms"."nav_items" DROP COLUMN "parent_id";
  DROP TYPE "cms"."enum_nav_items_kind";`);
}

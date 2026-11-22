import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-postgres";

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "cms"."dream_site" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"domain" varchar,
  	"license_key" varchar,
  	"license_key_prefix" varchar,
  	"registered_at" timestamp(3) with time zone,
  	"last_reported_at" timestamp(3) with time zone,
  	"last_error" varchar,
  	"nonce" varchar,
  	"last_attempt_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  `);
}

export async function down({
  db,
  payload,
  req,
}: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "cms"."dream_site" CASCADE;`);
}

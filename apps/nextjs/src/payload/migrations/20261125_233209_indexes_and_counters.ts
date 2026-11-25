import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE INDEX "users_stripe_customer_i_d_idx" ON "cms"."users" USING btree ("stripe_customer_i_d");
  CREATE INDEX "status_createdAt_idx" ON "cms"."reviews" USING btree ("status","created_at");
  CREATE INDEX "space_status_publishedAt_idx" ON "cms"."community_posts" USING btree ("space_id","status","published_at");
  CREATE INDEX "status_scheduledAt_idx" ON "cms"."notifications" USING btree ("status","scheduled_at");
  ALTER TABLE "cms"."community_posts" DROP COLUMN "like_count";
  ALTER TABLE "cms"."community_posts" DROP COLUMN "comment_count";
  ALTER TABLE "cms"."comments" DROP COLUMN "like_count";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "cms"."users_stripe_customer_i_d_idx";
  DROP INDEX "cms"."status_createdAt_idx";
  DROP INDEX "cms"."space_status_publishedAt_idx";
  DROP INDEX "cms"."status_scheduledAt_idx";
  ALTER TABLE "cms"."community_posts" ADD COLUMN "like_count" numeric DEFAULT 0;
  ALTER TABLE "cms"."community_posts" ADD COLUMN "comment_count" numeric DEFAULT 0;
  ALTER TABLE "cms"."comments" ADD COLUMN "like_count" numeric DEFAULT 0;`)
}

import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE INDEX "users_stripe_customer_i_d_idx" ON "cms"."users" USING btree ("stripe_customer_i_d");
  CREATE INDEX "status_createdAt_idx" ON "cms"."reviews" USING btree ("status","created_at");
  CREATE INDEX "space_status_publishedAt_idx" ON "cms"."community_posts" USING btree ("space_id","status","published_at");
  CREATE INDEX "status_scheduledAt_idx" ON "cms"."notifications" USING btree ("status","scheduled_at");`)
  // Expand/contract (tooling/mod/src/migration-safety.ts): the removed
  // like_count / comment_count fields keep their columns for one release, so
  // the previous release's code still works if an update is reverted. A
  // later release drops them (dream:contract).
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "cms"."users_stripe_customer_i_d_idx";
  DROP INDEX "cms"."status_createdAt_idx";
  DROP INDEX "cms"."space_status_publishedAt_idx";
  DROP INDEX "cms"."status_scheduledAt_idx";`)
}

import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."_mod_billing_settings_v_version_enterprise_tier_features" DROP CONSTRAINT "_mod_billing_settings_v_version_enterprise_tier_features_parent_id_fk";
  
  ALTER TABLE "cms"."_mod_billing_settings_v" DROP CONSTRAINT "_mod_billing_settings_v_version_featured_review_id_reviews_id_fk";
  
  DROP INDEX "cms"."_mod_billing_settings_v_version_free_tier_features_parent_id_idx";
  DROP INDEX "cms"."_mod_billing_settings_v_version_enterprise_tier_features_order_idx";
  DROP INDEX "cms"."_mod_billing_settings_v_version_enterprise_tier_features_parent_id_idx";
  DROP INDEX "cms"."_mod_chat_settings_v_version_channel_prompts_channels_parent_idx";
  ALTER TABLE "cms"."_mod_billing_settings_v_version_enterprise_tier_features" ADD CONSTRAINT "_mod_billing_settings_v_version_enterprise_tier_fea_d7bc77b2_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_mod_billing_settings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_mod_billing_settings_v" ADD CONSTRAINT "_mod_billing_settings_v_version_featured_review_id__ae7f1b38_fk" FOREIGN KEY ("version_featured_review_id") REFERENCES "cms"."reviews"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "_mod_billing_settings_v_version_free_tier_features_3dd54055_idx" ON "cms"."_mod_billing_settings_v_version_free_tier_features" USING btree ("_parent_id");
  CREATE INDEX "_mod_billing_settings_v_version_enterprise_tier_fe_a24f7fbc_idx" ON "cms"."_mod_billing_settings_v_version_enterprise_tier_features" USING btree ("_order");
  CREATE INDEX "_mod_billing_settings_v_version_enterprise_tier_fe_0ae639ec_idx" ON "cms"."_mod_billing_settings_v_version_enterprise_tier_features" USING btree ("_parent_id");
  CREATE INDEX "_mod_chat_settings_v_version_channel_prompts_chann_923e5bb3_idx" ON "cms"."_mod_chat_settings_v_version_channel_prompts_channels" USING btree ("parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."_mod_billing_settings_v_version_enterprise_tier_features" DROP CONSTRAINT "_mod_billing_settings_v_version_enterprise_tier_fea_d7bc77b2_fk";
  
  ALTER TABLE "cms"."_mod_billing_settings_v" DROP CONSTRAINT "_mod_billing_settings_v_version_featured_review_id__ae7f1b38_fk";
  
  DROP INDEX "cms"."_mod_billing_settings_v_version_free_tier_features_3dd54055_idx";
  DROP INDEX "cms"."_mod_billing_settings_v_version_enterprise_tier_fe_a24f7fbc_idx";
  DROP INDEX "cms"."_mod_billing_settings_v_version_enterprise_tier_fe_0ae639ec_idx";
  DROP INDEX "cms"."_mod_chat_settings_v_version_channel_prompts_chann_923e5bb3_idx";
  ALTER TABLE "cms"."_mod_billing_settings_v_version_enterprise_tier_features" ADD CONSTRAINT "_mod_billing_settings_v_version_enterprise_tier_features_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."_mod_billing_settings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."_mod_billing_settings_v" ADD CONSTRAINT "_mod_billing_settings_v_version_featured_review_id_reviews_id_fk" FOREIGN KEY ("version_featured_review_id") REFERENCES "cms"."reviews"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "_mod_billing_settings_v_version_free_tier_features_parent_id_idx" ON "cms"."_mod_billing_settings_v_version_free_tier_features" USING btree ("_parent_id");
  CREATE INDEX "_mod_billing_settings_v_version_enterprise_tier_features_order_idx" ON "cms"."_mod_billing_settings_v_version_enterprise_tier_features" USING btree ("_order");
  CREATE INDEX "_mod_billing_settings_v_version_enterprise_tier_features_parent_id_idx" ON "cms"."_mod_billing_settings_v_version_enterprise_tier_features" USING btree ("_parent_id");
  CREATE INDEX "_mod_chat_settings_v_version_channel_prompts_channels_parent_idx" ON "cms"."_mod_chat_settings_v_version_channel_prompts_channels" USING btree ("parent_id");`)
}

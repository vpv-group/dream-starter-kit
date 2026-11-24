import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_kit_modules_mod_chat_channel_prompts_channels" AS ENUM('web', 'native', 'slack', 'sms-sendblue', 'telegram', 'whatsapp', 'discord', 'teams', 'google-chat', 'messenger', 'email', 'twilio-sms', 'github', 'linear');
  CREATE TYPE "cms"."enum_kit_modules_mod_billing_billing_toggle_default" AS ENUM('monthly', 'annual');
  CREATE TYPE "cms"."enum_kit_modules_mod_chat_llm_fallback_model" AS ENUM('anthropic/claude-sonnet-4.5', 'anthropic/claude-opus-4.1', 'anthropic/claude-haiku-4.5');
  CREATE TYPE "cms"."enum_nav_items_audience" AS ENUM('everyone', 'staff');
  CREATE TABLE "cms"."kit_modules_mod_billing_free_tier_features" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"included" boolean DEFAULT true
  );
  
  CREATE TABLE "cms"."kit_modules_mod_billing_enterprise_tier_features" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"included" boolean DEFAULT true
  );
  
  CREATE TABLE "cms"."kit_modules_mod_chat_channel_prompts_channels" (
  	"order" integer NOT NULL,
  	"parent_id" varchar NOT NULL,
  	"value" "cms"."enum_kit_modules_mod_chat_channel_prompts_channels",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "cms"."kit_modules_mod_chat_channel_prompts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"prompt" varchar
  );
  
  CREATE TABLE "cms"."kit_modules_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"mod_billing_plans_id" integer
  );
  
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "access_check" varchar;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "settings_copied" boolean DEFAULT false;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_billing_heading" varchar DEFAULT 'Pricing';
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_billing_show_free_tier" boolean DEFAULT true;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_billing_subheading" varchar DEFAULT 'Start free. Upgrade when you''re ready.';
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_billing_billing_toggle_default" "cms"."enum_kit_modules_mod_billing_billing_toggle_default" DEFAULT 'monthly';
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_billing_free_tier_name" varchar DEFAULT 'Free';
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_billing_free_tier_description" varchar DEFAULT 'Everything you need to get started.';
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_billing_free_tier_cta_label" varchar DEFAULT 'Get started';
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_billing_free_tier_link_url" varchar;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_billing_free_tier_link_new_tab" boolean DEFAULT false;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_billing_show_enterprise_tier" boolean DEFAULT true;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_billing_enterprise_tier_name" varchar DEFAULT 'Enterprise';
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_billing_enterprise_tier_description" varchar DEFAULT 'Total access for your whole team, billed your way.';
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_billing_enterprise_tier_cta_label" varchar DEFAULT 'Contact sales';
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_billing_enterprise_tier_link_url" varchar;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_billing_enterprise_tier_link_new_tab" boolean DEFAULT false;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_billing_featured_review_id" integer;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_billing_disclaimer" varchar;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_chat_max_history_messages" numeric DEFAULT 20;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_chat_universal_prompt" varchar DEFAULT 'You are a concise, friendly assistant inside the Dream app.';
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_chat_skills_feature_enabled" boolean DEFAULT false;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_chat_keyword_threshold" numeric DEFAULT 0.6;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_chat_use_llm_fallback" boolean DEFAULT true;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_chat_llm_fallback_model" "cms"."enum_kit_modules_mod_chat_llm_fallback_model" DEFAULT 'anthropic/claude-haiku-4.5';
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_chat_stickiness_turns" numeric DEFAULT 2;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_chat_transcription_enabled" boolean DEFAULT false;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_chat_transcription_model" varchar DEFAULT 'openai/whisper-1';
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_chat_max_audio_m_b" numeric DEFAULT 25;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_chat_adapter_chat_adapter_sendblue_enabled" boolean DEFAULT true;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_chat_adapter_chat_adapter_sendblue_daily_outbound_quota" numeric DEFAULT 200;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_chat_adapter_chat_adapter_slack_enabled" boolean DEFAULT true;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_docs_github_repo" varchar;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_docs_github_branch" varchar DEFAULT 'main';
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_docs_github_path" varchar DEFAULT 'docs';
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_docs_sync_now" boolean DEFAULT false;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_docs_sync_status" varchar;
  ALTER TABLE "cms"."kit_modules" ADD COLUMN "mod_docs_sync_error" varchar;
  ALTER TABLE "cms"."nav_items" ADD COLUMN "audience" "cms"."enum_nav_items_audience" DEFAULT 'everyone';
  ALTER TABLE "cms"."kit_modules_mod_billing_free_tier_features" ADD CONSTRAINT "kit_modules_mod_billing_free_tier_features_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."kit_modules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."kit_modules_mod_billing_enterprise_tier_features" ADD CONSTRAINT "kit_modules_mod_billing_enterprise_tier_features_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."kit_modules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."kit_modules_mod_chat_channel_prompts_channels" ADD CONSTRAINT "kit_modules_mod_chat_channel_prompts_channels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."kit_modules_mod_chat_channel_prompts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."kit_modules_mod_chat_channel_prompts" ADD CONSTRAINT "kit_modules_mod_chat_channel_prompts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."kit_modules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."kit_modules_rels" ADD CONSTRAINT "kit_modules_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "cms"."kit_modules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cms"."kit_modules_rels" ADD CONSTRAINT "kit_modules_rels_mod_billing_plans_fk" FOREIGN KEY ("mod_billing_plans_id") REFERENCES "cms"."mod_billing_plans"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "kit_modules_mod_billing_free_tier_features_order_idx" ON "cms"."kit_modules_mod_billing_free_tier_features" USING btree ("_order");
  CREATE INDEX "kit_modules_mod_billing_free_tier_features_parent_id_idx" ON "cms"."kit_modules_mod_billing_free_tier_features" USING btree ("_parent_id");
  CREATE INDEX "kit_modules_mod_billing_enterprise_tier_features_order_idx" ON "cms"."kit_modules_mod_billing_enterprise_tier_features" USING btree ("_order");
  CREATE INDEX "kit_modules_mod_billing_enterprise_tier_features_parent_id_idx" ON "cms"."kit_modules_mod_billing_enterprise_tier_features" USING btree ("_parent_id");
  CREATE INDEX "kit_modules_mod_chat_channel_prompts_channels_order_idx" ON "cms"."kit_modules_mod_chat_channel_prompts_channels" USING btree ("order");
  CREATE INDEX "kit_modules_mod_chat_channel_prompts_channels_parent_idx" ON "cms"."kit_modules_mod_chat_channel_prompts_channels" USING btree ("parent_id");
  CREATE INDEX "kit_modules_mod_chat_channel_prompts_order_idx" ON "cms"."kit_modules_mod_chat_channel_prompts" USING btree ("_order");
  CREATE INDEX "kit_modules_mod_chat_channel_prompts_parent_id_idx" ON "cms"."kit_modules_mod_chat_channel_prompts" USING btree ("_parent_id");
  CREATE INDEX "kit_modules_rels_order_idx" ON "cms"."kit_modules_rels" USING btree ("order");
  CREATE INDEX "kit_modules_rels_parent_idx" ON "cms"."kit_modules_rels" USING btree ("parent_id");
  CREATE INDEX "kit_modules_rels_path_idx" ON "cms"."kit_modules_rels" USING btree ("path");
  CREATE INDEX "kit_modules_rels_mod_billing_plans_id_idx" ON "cms"."kit_modules_rels" USING btree ("mod_billing_plans_id");
  ALTER TABLE "cms"."kit_modules" ADD CONSTRAINT "kit_modules_mod_billing_featured_review_id_reviews_id_fk" FOREIGN KEY ("mod_billing_featured_review_id") REFERENCES "cms"."reviews"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "kit_modules_mod_billing_mod_billing_featured_review_idx" ON "cms"."kit_modules" USING btree ("mod_billing_featured_review_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."kit_modules_mod_billing_free_tier_features" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."kit_modules_mod_billing_enterprise_tier_features" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."kit_modules_mod_chat_channel_prompts_channels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."kit_modules_mod_chat_channel_prompts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "cms"."kit_modules_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "cms"."kit_modules_mod_billing_free_tier_features" CASCADE;
  DROP TABLE "cms"."kit_modules_mod_billing_enterprise_tier_features" CASCADE;
  DROP TABLE "cms"."kit_modules_mod_chat_channel_prompts_channels" CASCADE;
  DROP TABLE "cms"."kit_modules_mod_chat_channel_prompts" CASCADE;
  DROP TABLE "cms"."kit_modules_rels" CASCADE;
  ALTER TABLE "cms"."kit_modules" DROP CONSTRAINT "kit_modules_mod_billing_featured_review_id_reviews_id_fk";
  
  DROP INDEX "cms"."kit_modules_mod_billing_mod_billing_featured_review_idx";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "access_check";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "settings_copied";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_billing_heading";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_billing_show_free_tier";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_billing_subheading";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_billing_billing_toggle_default";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_billing_free_tier_name";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_billing_free_tier_description";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_billing_free_tier_cta_label";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_billing_free_tier_link_url";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_billing_free_tier_link_new_tab";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_billing_show_enterprise_tier";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_billing_enterprise_tier_name";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_billing_enterprise_tier_description";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_billing_enterprise_tier_cta_label";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_billing_enterprise_tier_link_url";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_billing_enterprise_tier_link_new_tab";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_billing_featured_review_id";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_billing_disclaimer";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_chat_max_history_messages";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_chat_universal_prompt";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_chat_skills_feature_enabled";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_chat_keyword_threshold";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_chat_use_llm_fallback";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_chat_llm_fallback_model";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_chat_stickiness_turns";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_chat_transcription_enabled";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_chat_transcription_model";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_chat_max_audio_m_b";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_chat_adapter_chat_adapter_sendblue_enabled";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_chat_adapter_chat_adapter_sendblue_daily_outbound_quota";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_chat_adapter_chat_adapter_slack_enabled";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_docs_github_repo";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_docs_github_branch";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_docs_github_path";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_docs_sync_now";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_docs_sync_status";
  ALTER TABLE "cms"."kit_modules" DROP COLUMN "mod_docs_sync_error";
  ALTER TABLE "cms"."nav_items" DROP COLUMN "audience";
  DROP TYPE "cms"."enum_kit_modules_mod_chat_channel_prompts_channels";
  DROP TYPE "cms"."enum_kit_modules_mod_billing_billing_toggle_default";
  DROP TYPE "cms"."enum_kit_modules_mod_chat_llm_fallback_model";
  DROP TYPE "cms"."enum_nav_items_audience";`)
}

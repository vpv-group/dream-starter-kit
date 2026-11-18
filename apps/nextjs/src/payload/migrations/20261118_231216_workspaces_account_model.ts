import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "cms"."enum_authentication_settings_onboarding_steps_step" AS ENUM('profile', 'invite', 'integrations', 'updates', 'plan');
  CREATE TYPE "cms"."enum_authentication_settings_account_model" AS ENUM('consumer', 'business', 'hybrid');
  CREATE TYPE "cms"."enum_authentication_settings_workspace_label" AS ENUM('Workspace', 'Organization', 'Team', 'Studio', 'Practice');
  CREATE TABLE "cms"."authentication_settings_onboarding_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"step" "cms"."enum_authentication_settings_onboarding_steps_step",
  	"enabled" boolean DEFAULT false
  );
  
  ALTER TABLE "cms"."authentication_settings" ADD COLUMN "account_model" "cms"."enum_authentication_settings_account_model" DEFAULT 'consumer';
  ALTER TABLE "cms"."authentication_settings" ADD COLUMN "account_model_chosen_at" timestamp(3) with time zone;
  ALTER TABLE "cms"."authentication_settings" ADD COLUMN "workspace_label" "cms"."enum_authentication_settings_workspace_label" DEFAULT 'Workspace';
  ALTER TABLE "cms"."authentication_settings" ADD COLUMN "workspace_url_prefix" varchar;
  ALTER TABLE "cms"."authentication_settings" ADD COLUMN "invite_expiry_days" numeric DEFAULT 7;
  ALTER TABLE "cms"."authentication_settings" ADD COLUMN "allow_invite_links" boolean DEFAULT true;
  ALTER TABLE "cms"."authentication_settings_onboarding_steps" ADD CONSTRAINT "authentication_settings_onboarding_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "cms"."authentication_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "authentication_settings_onboarding_steps_order_idx" ON "cms"."authentication_settings_onboarding_steps" USING btree ("_order");
  CREATE INDEX "authentication_settings_onboarding_steps_parent_id_idx" ON "cms"."authentication_settings_onboarding_steps" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "cms"."authentication_settings_onboarding_steps" CASCADE;
  ALTER TABLE "cms"."authentication_settings" DROP COLUMN "account_model";
  ALTER TABLE "cms"."authentication_settings" DROP COLUMN "account_model_chosen_at";
  ALTER TABLE "cms"."authentication_settings" DROP COLUMN "workspace_label";
  ALTER TABLE "cms"."authentication_settings" DROP COLUMN "workspace_url_prefix";
  ALTER TABLE "cms"."authentication_settings" DROP COLUMN "invite_expiry_days";
  ALTER TABLE "cms"."authentication_settings" DROP COLUMN "allow_invite_links";
  DROP TYPE "cms"."enum_authentication_settings_onboarding_steps_step";
  DROP TYPE "cms"."enum_authentication_settings_account_model";
  DROP TYPE "cms"."enum_authentication_settings_workspace_label";`)
}

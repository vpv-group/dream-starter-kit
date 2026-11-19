import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Adds authentication_settings.organization_mode EARLY (before
 * 20260827_194500_move_legal_docs). That older data migration reads the
 * authentication-settings global through the Local API, which selects every
 * column the CURRENT config defines — so on a fresh database the column must
 * exist before it runs. Idempotent; 20261119_033314_organization_mode carries
 * the schema snapshot and is a no-op when this already ran.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "cms"."enum_authentication_settings_organization_mode" AS ENUM('off', 'personal', 'required');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    ALTER TABLE "cms"."authentication_settings"
      ADD COLUMN IF NOT EXISTS "organization_mode" "cms"."enum_authentication_settings_organization_mode" DEFAULT 'off';
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "cms"."authentication_settings" DROP COLUMN IF EXISTS "organization_mode";
    DROP TYPE IF EXISTS "cms"."enum_authentication_settings_organization_mode";
  `);
}

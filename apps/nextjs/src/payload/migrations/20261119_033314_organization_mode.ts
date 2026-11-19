import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Schema snapshot for authentication_settings.organization_mode (see the
 * matching .json). The column itself is created by
 * 20260827_194400_organization_mode_column so older data migrations can read
 * the global on a fresh database; this one is idempotent.
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

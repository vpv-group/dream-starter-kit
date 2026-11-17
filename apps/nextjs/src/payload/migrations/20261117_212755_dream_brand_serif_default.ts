import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Makes Instrument Serif the default serif. Split from
// 20261117_212656_dream_brand_theme_defaults, which adds the enum value:
// Postgres only allows a new enum value to be used once the transaction that
// added it has committed.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."theme_settings" ALTER COLUMN "font_serif" SET DEFAULT 'instrument-serif';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_font_serif" SET DEFAULT 'instrument-serif';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cms"."theme_settings" ALTER COLUMN "font_serif" SET DEFAULT 'merriweather';
  ALTER TABLE "cms"."_theme_settings_v" ALTER COLUMN "version_font_serif" SET DEFAULT 'merriweather';`)
}

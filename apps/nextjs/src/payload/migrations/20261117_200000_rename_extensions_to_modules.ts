import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Hand-written rename migration: modules used to be called "extensions".
 * Collection/global slugs moved from `ext-<slug>-*` to `mod-<slug>-*` and
 * the framework collection from `kit-extensions` to `kit-modules` (nav-items'
 * `extension` relationship is now `module`), so every cms-schema object named
 * after them is renamed in place: tables, version tables, enum types,
 * sequences, columns (incl. the `<collection>_id` columns on other tables'
 * _rels tables), indexes and constraints. Renames keep all rows. `ext` and
 * `mod` have the same length, so names Postgres truncated at 63 characters
 * stay identical to what a fresh install creates.
 *
 * Data: nav-items keys (`ext:<slug>:<href>` → `mod:…`), saved admin
 * preferences and document locks that store the old slugs.
 *
 * Idempotent (a no-op once renamed). The paired .json snapshot is the full
 * schema after this migration, generated from the config with Payload's
 * drizzle-kit, so later `migrate:create` diffs start from the new names.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE OR REPLACE FUNCTION pg_temp.mod_rename(n text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $f$
    SELECT regexp_replace(
      regexp_replace(n, '(?<![a-z0-9])ext_', 'mod_', 'g'),
      '(?<![a-z0-9])extension', 'module', 'g')
  $f$;

  DO $$
  DECLARE
    r record;
    pat constant text := '(?<![a-z0-9])(ext_|extension)';
  BEGIN
    FOR r IN
      SELECT c.conname AS name, t.relname AS tbl
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace s ON s.oid = t.relnamespace
      WHERE s.nspname = 'cms' AND c.conname ~ pat
    LOOP
      EXECUTE format('ALTER TABLE cms.%I RENAME CONSTRAINT %I TO %I',
        r.tbl, r.name, pg_temp.mod_rename(r.name));
    END LOOP;

    FOR r IN
      SELECT c.relname AS name, c.relkind AS kind
      FROM pg_class c
      JOIN pg_namespace s ON s.oid = c.relnamespace
      WHERE s.nspname = 'cms' AND c.relkind IN ('i', 'S') AND c.relname ~ pat
    LOOP
      EXECUTE format(
        CASE r.kind WHEN 'i' THEN 'ALTER INDEX cms.%I RENAME TO %I'
                    ELSE 'ALTER SEQUENCE cms.%I RENAME TO %I' END,
        r.name, pg_temp.mod_rename(r.name));
    END LOOP;

    FOR r IN
      SELECT c.relname AS tbl, a.attname AS name
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace s ON s.oid = c.relnamespace
      WHERE s.nspname = 'cms' AND c.relkind = 'r'
        AND a.attnum > 0 AND NOT a.attisdropped AND a.attname ~ pat
    LOOP
      EXECUTE format('ALTER TABLE cms.%I RENAME COLUMN %I TO %I',
        r.tbl, r.name, pg_temp.mod_rename(r.name));
    END LOOP;

    FOR r IN
      SELECT c.relname AS name
      FROM pg_class c
      JOIN pg_namespace s ON s.oid = c.relnamespace
      WHERE s.nspname = 'cms' AND c.relkind = 'r' AND c.relname ~ pat
    LOOP
      EXECUTE format('ALTER TABLE cms.%I RENAME TO %I',
        r.name, pg_temp.mod_rename(r.name));
    END LOOP;

    FOR r IN
      SELECT t.typname AS name
      FROM pg_type t
      JOIN pg_namespace s ON s.oid = t.typnamespace
      WHERE s.nspname = 'cms' AND t.typtype = 'e' AND t.typname ~ pat
    LOOP
      EXECUTE format('ALTER TYPE cms.%I RENAME TO %I',
        r.name, pg_temp.mod_rename(r.name));
    END LOOP;
  END
  $$;

  DROP FUNCTION pg_temp.mod_rename(text);

  UPDATE "cms"."nav_items" SET "key" = 'mod:' || substr("key", 5)
  WHERE "key" LIKE 'ext:%';

  UPDATE "cms"."payload_locked_documents"
  SET "global_slug" = 'mod-' || substr("global_slug", 5)
  WHERE "global_slug" LIKE 'ext-%';

  UPDATE "cms"."payload_preferences"
  SET "key" = replace(
    regexp_replace("key", '(?<![a-z0-9])ext-', 'mod-', 'g'),
    'kit-extensions', 'kit-modules')
  WHERE "key" ~ '(?<![a-z0-9])ext-' OR "key" LIKE '%kit-extensions%';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // The inverse touches only names this migration produced: core already has
  // unrelated "module" names (lessons.module), so no blanket module → extension.
  await db.execute(sql`
  CREATE OR REPLACE FUNCTION pg_temp.ext_rename(n text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $f$
    SELECT regexp_replace(
      regexp_replace(
        regexp_replace(n, '(?<![a-z0-9])mod_', 'ext_', 'g'),
        'kit_modules', 'kit_extensions', 'g'),
      '^nav_items_module', 'nav_items_extension')
  $f$;

  DO $$
  DECLARE
    r record;
    pat constant text := '(?<![a-z0-9])mod_|kit_modules|^nav_items_module';
  BEGIN
    FOR r IN
      SELECT c.conname AS name, t.relname AS tbl
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace s ON s.oid = t.relnamespace
      WHERE s.nspname = 'cms' AND c.conname ~ pat
    LOOP
      EXECUTE format('ALTER TABLE cms.%I RENAME CONSTRAINT %I TO %I',
        r.tbl, r.name, pg_temp.ext_rename(r.name));
    END LOOP;

    FOR r IN
      SELECT c.relname AS name, c.relkind AS kind
      FROM pg_class c
      JOIN pg_namespace s ON s.oid = c.relnamespace
      WHERE s.nspname = 'cms' AND c.relkind IN ('i', 'S') AND c.relname ~ pat
    LOOP
      EXECUTE format(
        CASE r.kind WHEN 'i' THEN 'ALTER INDEX cms.%I RENAME TO %I'
                    ELSE 'ALTER SEQUENCE cms.%I RENAME TO %I' END,
        r.name, pg_temp.ext_rename(r.name));
    END LOOP;

    FOR r IN
      SELECT c.relname AS tbl, a.attname AS name
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace s ON s.oid = c.relnamespace
      WHERE s.nspname = 'cms' AND c.relkind = 'r'
        AND a.attnum > 0 AND NOT a.attisdropped
        AND (a.attname ~ '(?<![a-z0-9])mod_|kit_modules'
             OR (c.relname = 'nav_items' AND a.attname = 'module_id'))
    LOOP
      EXECUTE format('ALTER TABLE cms.%I RENAME COLUMN %I TO %I',
        r.tbl, r.name,
        CASE WHEN r.name = 'module_id' THEN 'extension_id'
             ELSE pg_temp.ext_rename(r.name) END);
    END LOOP;

    FOR r IN
      SELECT c.relname AS name
      FROM pg_class c
      JOIN pg_namespace s ON s.oid = c.relnamespace
      WHERE s.nspname = 'cms' AND c.relkind = 'r' AND c.relname ~ pat
    LOOP
      EXECUTE format('ALTER TABLE cms.%I RENAME TO %I',
        r.name, pg_temp.ext_rename(r.name));
    END LOOP;

    FOR r IN
      SELECT t.typname AS name
      FROM pg_type t
      JOIN pg_namespace s ON s.oid = t.typnamespace
      WHERE s.nspname = 'cms' AND t.typtype = 'e' AND t.typname ~ pat
    LOOP
      EXECUTE format('ALTER TYPE cms.%I RENAME TO %I',
        r.name, pg_temp.ext_rename(r.name));
    END LOOP;
  END
  $$;

  DROP FUNCTION pg_temp.ext_rename(text);

  UPDATE "cms"."nav_items" SET "key" = 'ext:' || substr("key", 5)
  WHERE "key" LIKE 'mod:%';

  UPDATE "cms"."payload_locked_documents"
  SET "global_slug" = 'ext-' || substr("global_slug", 5)
  WHERE "global_slug" LIKE 'mod-%';

  UPDATE "cms"."payload_preferences"
  SET "key" = replace(
    regexp_replace("key", '(?<![a-z0-9])mod-', 'ext-', 'g'),
    'kit-modules', 'kit-extensions')
  WHERE "key" ~ '(?<![a-z0-9])mod-' OR "key" LIKE '%kit-modules%';`)
}

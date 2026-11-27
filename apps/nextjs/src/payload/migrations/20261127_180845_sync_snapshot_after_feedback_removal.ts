import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

// Intentionally empty: this migration only carries a fresh schema snapshot
// (the .json beside it). The feedback module left the kit for the Dream
// registry (`pnpm mod add dream:feedback`), but the newest snapshot
// (20261127_174251) still described its cms tables and settings columns, so
// the next `pnpm cms:migrate:create` would emit DROP statements for tables a
// fresh kit never creates. This snapshot is the kit without feedback; apps
// that install dream:feedback get its Payload migrations from the module.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {}

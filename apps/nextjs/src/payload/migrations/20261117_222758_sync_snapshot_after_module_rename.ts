import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

// Intentionally empty: this migration only carries a fresh schema snapshot
// (the .json beside it). The rename to modules (20261117_200000) and the Dream
// theme defaults (20261117_212656 and 212755) were built in parallel, so each
// snapshot knew only its own change. This snapshot holds both, so the next
// `pnpm cms:migrate:create` diffs from the real schema. The SQL for both
// changes already ships in those three migrations.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {}

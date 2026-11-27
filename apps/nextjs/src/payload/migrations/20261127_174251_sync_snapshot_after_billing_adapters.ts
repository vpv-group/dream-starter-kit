import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

// Intentionally empty: this migration only carries a fresh schema snapshot
// (the .json beside it). The billing provider adapters (20261126_193316,
// shipped by modules/billing) and the feedback module (20261126_201522 …
// 20261127_030754) were built in parallel, so the feedback snapshots never
// knew billing's settings columns and every `pnpm cms:migrate:create`
// re-emitted them. This snapshot holds both, so the next migration diffs from
// the real schema. The SQL for the billing change already ships in
// 20261126_193316_billing_provider_adapters.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {}

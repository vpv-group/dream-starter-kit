/**
 * Merge the core Payload migrations with the module ones into the single list
 * Payload runs (`prodMigrations`) and the bootstrap tracks.
 *
 * `pnpm mod sync` also copies every module migration into the core
 * `payload/migrations` dir (so the local `payload migrate` CLI applies it), so
 * the same migration NAME arrives twice: once as the core copy, once from
 * `modPayloadMigrations`. Payload's `migrate()` reads its ledger once before
 * looping, so on a fresh database a duplicate name would run twice and fail
 * on its unguarded `CREATE TYPE`. Dedupe by name (first occurrence wins — the
 * core copy, which is the file the CLI applies) and sort by name, which is the
 * timestamp-prefixed order Payload expects.
 */
export function mergePayloadMigrations<T extends { name: string }>(
  ...lists: readonly (readonly T[])[]
): T[] {
  const byName = new Map<string, T>();
  for (const list of lists) {
    for (const migration of list) {
      if (!byName.has(migration.name)) byName.set(migration.name, migration);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

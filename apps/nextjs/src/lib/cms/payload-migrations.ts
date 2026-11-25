/**
 * The one list of Payload (`cms` schema) migrations the server runs at boot
 * (`prodMigrations` in payload.config.ts) and the bootstrap watches for
 * (lib/db/bootstrap-runner.ts).
 *
 * It merges the core migrations (payload/migrations/index.ts) with the
 * installed modules' own (modPayloadMigrations). The two overlap: `pnpm mod
 * sync` also copies every module migration into payload/migrations/ so the
 * local `payload migrate` CLI applies it, and the core index lists those
 * copies. Payload reads its ledger once and then runs the list in order, so a
 * name listed twice ran twice on a fresh database and the second run failed
 * ("type … already exists") — the production first boot then gave up and only
 * got one duplicate further per restart. Each name is kept once (the copies
 * are byte-identical to the module's), sorted by its timestamp prefix.
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

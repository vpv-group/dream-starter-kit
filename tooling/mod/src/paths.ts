import { existsSync } from "node:fs";
import path from "node:path";

/** Walk up from `start` until pnpm-workspace.yaml is found (the repo root). */
export function findRepoRoot(start = process.cwd()): string {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Could not find repo root (pnpm-workspace.yaml) above ${start}`,
      );
    }
    dir = parent;
  }
}

/**
 * Every path the framework owns, repo-relative (posix separators — they're
 * used as map keys and in the lock; convert with toAbs for fs access).
 */
export const MOD_PATHS = {
  modulesDir: "modules",
  rootLock: "modules.lock",
  migrationPins: "modules/.mod-lock.json",
  supabaseMigrationsDir: "supabase/migrations",
  supabaseFunctionsDir: "supabase/functions",
  envExample: ".env.example",
  // Generated registries (committed; drift fails `pnpm test`).
  nextDataRegistry: "apps/nextjs/src/mod/registry.data.generated.ts",
  nextClientRegistry: "apps/nextjs/src/mod/registry.client.generated.ts",
  nextServerRegistry: "apps/nextjs/src/mod/registry.server.generated.ts",
  nextPayloadRegistry: "apps/nextjs/src/mod/registry.payload.generated.ts",
  nextEnv: "apps/nextjs/src/mod/env.generated.ts",
  nextLockModule: "apps/nextjs/src/mod/lock.generated.ts",
  nextTranspileJson: "apps/nextjs/mod-packages.generated.json",
  expoRegistry: "apps/expo/src/mod/registry.generated.ts",
  expoEnv: "apps/expo/src/mod/env.generated.ts",
  // Stub roots (machine-owned subtrees, wiped + regenerated every sync).
  nextAppGroup: "apps/nextjs/src/app/(frontend)/(app)",
  nextPublicGroup: "apps/nextjs/src/app/(frontend)/(public)",
  expoAppGroup: "apps/expo/src/app/(app)",
} as const;

export function toAbs(repoRoot: string, repoRel: string): string {
  return path.join(repoRoot, ...repoRel.split("/"));
}

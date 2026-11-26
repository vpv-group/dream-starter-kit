/**
 * Which first-party modules this app has installed, from `modules.lock`.
 *
 * The kit's central RLS and query-plan suites cover the tables of the modules
 * the kit ships. An app may remove one (`pnpm mod remove chat`); those suites
 * then skip that module's cases instead of failing every later kit update.
 * Without a lock file (shouldn't happen), everything counts as installed.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function findLock(start: string): string | null {
  let dir = start;
  for (;;) {
    const candidate = path.join(dir, "modules.lock");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function readInstalled(): Set<string> | null {
  const lock = findLock(process.cwd());
  if (!lock) return null;
  try {
    const parsed = JSON.parse(readFileSync(lock, "utf8")) as {
      modules?: Record<string, unknown>;
    };
    return new Set(Object.keys(parsed.modules ?? {}));
  } catch {
    return null;
  }
}

const slugs = readInstalled();

/** Is the module `slug` installed in this app? */
export function installed(slug: string): boolean {
  return slugs === null || slugs.has(slug);
}

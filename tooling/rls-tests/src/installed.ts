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

interface LockEntry {
  installedVia?: string;
}

function readLock(): Record<string, LockEntry> | null {
  const lock = findLock(process.cwd());
  if (!lock) return null;
  try {
    const parsed = JSON.parse(readFileSync(lock, "utf8")) as {
      modules?: Record<string, LockEntry>;
    };
    return parsed.modules ?? {};
  } catch {
    return null;
  }
}

const lockModules = readLock();
const slugs = lockModules ? new Set(Object.keys(lockModules)) : null;

/** Is the module `slug` installed in this app? */
export function installed(slug: string): boolean {
  return slugs === null || slugs.has(slug);
}

/**
 * Does the kit own the database function `name`? Core functions (no `mod_`
 * prefix) and those of modules the kit ships preinstalled do; a third-party
 * or app module's functions don't (`mod_<slug>_…`, matched by the longest
 * installed slug so `mod_chat_extra_x` isn't taken for `chat`). Kit suites
 * gate only what the kit owns — a module's own problems must not fail every
 * kit update in the apps that install it.
 */
export function kitOwnsFunction(name: string): boolean {
  if (!name.startsWith("mod_")) return true;
  if (!lockModules) return true;
  const owner = Object.keys(lockModules)
    .filter((slug) => name.startsWith(`mod_${slug.replaceAll("-", "_")}_`))
    .sort((a, b) => b.length - a.length)[0];
  if (!owner) return false;
  return lockModules[owner]?.installedVia === "preinstalled";
}

/**
 * The module-ops "path confinement" check lets an install touch only module
 * code and the files `mod sync` generates. Route pages are generated too, but
 * under any URL a module mounts (`/feedback`, `/embed/<slug>`, `/a/<slug>`), so
 * they can't be allowlisted by path. Instead each changed file under the web
 * app's route groups must be exactly the page or layout the kit's own
 * generator writes for the installed modules (a deleted one must have been a
 * generated file), so a module can't smuggle hand-written code into app/.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { buildStubs, GENERATED_PREFIX } from "../generate";
import { loadModules } from "../manifests";
import { MOD_PATHS } from "../paths";

const ROUTE_GROUPS = [
  MOD_PATHS.nextAppGroup,
  MOD_PATHS.nextPublicGroup,
  MOD_PATHS.nextEmbedGroup,
].map((g) => `${g}/`);

export const isRouteGroupPath = (path: string): boolean =>
  ROUTE_GROUPS.some((g) => path.startsWith(g));

export interface RouteStubInput {
  /** Changed paths (repo-relative). */
  changed: string[];
  /** path → content `mod sync` generates for the installed modules. */
  expected: ReadonlyMap<string, string>;
  /** The file in the working tree; null when deleted. */
  read: (path: string) => string | null;
  /** The file at HEAD; null when it didn't exist. */
  readHead: (path: string) => string | null;
}

/** The changed paths that aren't generated route stubs. */
export function unverifiedRouteFiles(input: RouteStubInput): string[] {
  return input.changed.filter((path) => {
    if (!isRouteGroupPath(path)) return true;
    const now = input.read(path);
    if (now !== null) return input.expected.get(path) !== now;
    return !(input.readHead(path) ?? "").startsWith(GENERATED_PREFIX);
  });
}

/** `pnpm mod ops verify-route-stubs`: the real repo behind the pure check. */
export async function verifyRouteStubs(
  repoRoot: string,
  changed: string[],
): Promise<string[]> {
  const mods = await loadModules(repoRoot);
  const expected = new Map(buildStubs(mods).map((f) => [f.path, f.content]));
  return unverifiedRouteFiles({
    changed,
    expected,
    read: (path) => {
      const abs = join(repoRoot, path);
      return existsSync(abs) ? readFileSync(abs, "utf8") : null;
    },
    readHead: (path) => {
      try {
        return execFileSync("git", ["show", `HEAD:${path}`], {
          cwd: repoRoot,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        });
      } catch {
        return null;
      }
    },
  });
}

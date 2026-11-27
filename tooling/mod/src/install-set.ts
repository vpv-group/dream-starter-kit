/**
 * Which modules one `mod add` installs, and in what order
 * (docs/MODULES.md → Dependencies). Pure: fetching is injected, so it is
 * unit tested without the registry (install-set.test.ts).
 *
 * A module's `requires` (module.config.ts) must be installed for it to load,
 * and its workspace dependencies (`@acme/mod-<dep>`) must exist before
 * `pnpm install`. So `mod add projects-adapter-github` on a site without
 * Projects fetches Projects too, and both land in the same pull request,
 * dependencies first. A dependency that can't be fetched (not in the plan,
 * no release for this kit) fails the whole add BEFORE anything is copied,
 * with a message that names it.
 */

/** `requires: ["a", "b"]` in a module.config.ts, read without importing it. */
const REQUIRES_FROM_CONFIG = /\brequires:\s*\[([^\]]*)\]/;

export function readRequiresFromConfig(configText: string): string[] {
  const list = REQUIRES_FROM_CONFIG.exec(configText)?.[1];
  if (!list) return [];
  return [...list.matchAll(/["']([a-z][a-z0-9-]*)["']/g)]
    .map((m) => m[1] ?? "")
    .filter(Boolean);
}

export interface FetchedModule<T> {
  slug: string;
  requires: string[];
  /** Whatever the caller needs later (temp dir, lock source…). */
  payload: T;
}

export interface InstallSetDeps<T> {
  /** Is `modules/<slug>/` already in the repo? */
  isInstalled: (slug: string) => boolean;
  /** Fetch a source (`dream:<slug>`, a URL, a zip) into a temp dir. */
  fetch: (source: string) => Promise<FetchedModule<T>>;
}

export class DependencyError extends Error {}

/**
 * Fetch every requested source plus any missing modules they require,
 * recursively. Returns them dependencies-first, each slug once.
 */
export async function resolveInstallSet<T>(
  sources: string[],
  deps: InstallSetDeps<T>,
): Promise<FetchedModule<T>[]> {
  const ordered: FetchedModule<T>[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();

  const visit = async (mod: FetchedModule<T>, chain: string[]) => {
    if (done.has(mod.slug)) return;
    visiting.add(mod.slug);
    for (const dep of mod.requires) {
      // Installed, already in this set, or a cycle (validation reports
      // real cycles once everything is on disk).
      if (deps.isInstalled(dep) || done.has(dep) || visiting.has(dep)) {
        continue;
      }
      let fetched: FetchedModule<T>;
      try {
        fetched = await deps.fetch(`dream:${dep}`);
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        throw new DependencyError(
          `${[...chain, mod.slug].join(" → ")} requires the "${dep}" module, ` +
            `which isn't installed and couldn't be added: ${why}`,
        );
      }
      if (fetched.slug !== dep) {
        throw new DependencyError(
          `asked the registry for "${dep}" (required by ${mod.slug}) and got "${fetched.slug}"`,
        );
      }
      await visit(fetched, [...chain, mod.slug]);
    }
    visiting.delete(mod.slug);
    done.add(mod.slug);
    ordered.push(mod);
  };

  for (const source of sources) {
    const mod = await deps.fetch(source);
    if (deps.isInstalled(mod.slug)) {
      throw new Error(
        `modules/${mod.slug} already exists — use \`mod update\``,
      );
    }
    await visit(mod, []);
  }
  return ordered;
}

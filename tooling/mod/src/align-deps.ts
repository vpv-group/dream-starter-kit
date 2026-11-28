/**
 * Keep installed modules on the app's versions of shared packages.
 *
 * A module pins its own versions (`"expo-router": "~58.0.30"`), but the app
 * can only have one: two copies of a native package break the iOS and
 * Android builds, and the root `postinstall` (sherif) refuses an install
 * where packages ask for different versions. First-party modules move with
 * the kit; a module from the registry doesn't, so the first kit release that
 * bumps a shared package would break every app that has it installed.
 *
 * So a module's dependency on a package the app itself declares (apps/*,
 * packages/*, tooling/*, the root) is rewritten to the app's spec, `catalog:`
 * included. `workspace:` links and peer dependencies are left alone, and so
 * is a package the app doesn't use.
 *
 * `mod add` / `mod update` align the fetched module before it's snapshotted as
 * its pristine base, so `mod status` and 3-way updates only see real upstream
 * changes; `mod sync` aligns every installed module. It uses Node built-ins
 * only, so it also runs before `pnpm install` after a kit update:
 *
 *   pnpm mod:align   (node tooling/mod/src/align-deps.ts)
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIELDS = ["dependencies", "devDependencies"] as const;

export type Manifest = Partial<
  Record<(typeof FIELDS)[number], Record<string, string>>
>;

/** package → the one spec the app's own packages use for it. */
export function hostSpecs(manifests: Manifest[]): Map<string, string> {
  const seen = new Map<string, Set<string>>();
  for (const m of manifests) {
    for (const field of FIELDS) {
      for (const [name, spec] of Object.entries(m[field] ?? {})) {
        if (spec.startsWith("workspace:")) continue;
        const specs = seen.get(name) ?? new Set<string>();
        specs.add(spec);
        seen.set(name, specs);
      }
    }
  }
  const out = new Map<string, string>();
  // Where the app's own packages disagree there's no single answer: leave it
  // to sherif to report.
  for (const [name, specs] of seen) {
    if (specs.size === 1) out.set(name, [...specs][0] ?? "");
  }
  return out;
}

/** Rewrites `module` in place. Returns "name: from → to" per change. */
export function alignManifest(
  module: Manifest,
  host: ReadonlyMap<string, string>,
): string[] {
  const changes: string[] = [];
  for (const field of FIELDS) {
    const deps = module[field];
    if (!deps) continue;
    for (const [name, spec] of Object.entries(deps)) {
      if (spec.startsWith("workspace:")) continue;
      const want = host.get(name);
      if (want !== undefined && want !== spec) {
        deps[name] = want;
        changes.push(`${name}: ${spec} → ${want}`);
      }
    }
  }
  return changes;
}

const readJson = (file: string): Manifest =>
  JSON.parse(readFileSync(file, "utf8")) as Manifest;

const subdirs = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => path.join(dir, e.name))
    : [];

/** The app's own manifests: the root plus apps/*, packages/*, tooling/*. */
export function readHostSpecs(repoRoot: string): Map<string, string> {
  const files = [
    path.join(repoRoot, "package.json"),
    ...["apps", "packages", "tooling"].flatMap((d) =>
      subdirs(path.join(repoRoot, d)).map((p) => path.join(p, "package.json")),
    ),
  ].filter((f) => existsSync(f));
  return hostSpecs(files.map(readJson));
}

/** Align one module directory's package.json; returns the changes made. */
export function alignModuleDir(
  dir: string,
  host: ReadonlyMap<string, string>,
): string[] {
  const file = path.join(dir, "package.json");
  if (!existsSync(file)) return [];
  const text = readFileSync(file, "utf8");
  const manifest = JSON.parse(text) as Manifest;
  const changes = alignManifest(manifest, host);
  if (changes.length > 0) {
    const indent = /^\{\n( +|\t)"/.exec(text)?.[1] ?? "  ";
    writeFileSync(file, `${JSON.stringify(manifest, null, indent)}\n`);
  }
  return changes;
}

/** Align every module under modules/. */
export function alignInstalledModules(
  repoRoot: string,
): { slug: string; changes: string[] }[] {
  const host = readHostSpecs(repoRoot);
  return subdirs(path.join(repoRoot, "modules"))
    .map((dir) => ({
      slug: path.basename(dir),
      changes: alignModuleDir(dir, host),
    }))
    .filter((r) => r.changes.length > 0);
}

export function logAlignment(
  results: { slug: string; changes: string[] }[],
): void {
  for (const r of results) {
    console.log(
      `Aligned ${r.slug} to the app's versions: ${r.changes.join(", ")}`,
    );
  }
}

// `node tooling/mod/src/align-deps.ts [repoRoot]` (pnpm mod:align).
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = path.resolve(process.argv[2] ?? ".");
  const results = alignInstalledModules(root);
  logAlignment(results);
  if (results.length === 0)
    console.log("Modules already use the app's versions.");
}

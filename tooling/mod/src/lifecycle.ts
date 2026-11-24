import { execFileSync, execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import semver from "semver";

import { KIT_VERSION } from "@acme/config";

import type { ModLockEntry, ModSource } from "./lock";
import type { CatalogModule } from "./registry";
import type { Source, SourcePlan } from "./source-plan";
import {
  assertMergeTreeSupport,
  checkoutModuleTree,
  commitModuleTree,
  currentBase,
  git,
  mergeTrees,
  modifiedFiles,
  rerootLegacyBase,
  snapshotModule,
} from "./git";
import { installWorkspace } from "./install";
import { readLock, readPins, writeLock } from "./lock";
import { loadModules } from "./manifests";
import { nextVersion } from "./migrations";
import { MOD_PATHS, toAbs } from "./paths";
import {
  downloadVerified,
  fetchCatalog,
  fetchEntitlements,
  isDreamSource,
  latestCompatible,
  licenseKey,
  opsToken,
  parseDreamSource,
  registryUrl,
  repoIdentity,
  requestDownload,
  requireLicenseKey,
  requireOpsToken,
} from "./registry";
import {
  fallbackRepo,
  findInCatalog,
  planAdd,
  planUpdate,
  registryFirstEnabled,
} from "./source-plan";
import { sync } from "./sync";

/**
 * Module lifecycle: add / update / remove / status / eject /
 * payload-migrate (docs/MODULES-PLAN.md §5). One implementation, two front
 * doors — developers run it via `pnpm mod`, the admin panel's GitHub Actions
 * workflow runs the same commands with --json.
 */

const SLUG_FROM_CONFIG = /slug:\s*["']([a-z][a-z0-9-]{1,30})["']/;
const VERSION_FROM_CONFIG = /version:\s*["'](\d+\.\d+\.\d+[^"']*)["']/;

/** A bare module slug (`crm`, `crm@1.2.0`) means the Dream registry. */
const BARE_SLUG = /^[a-z][a-z0-9-]{1,30}(?:@v?\d+\.\d+\.\d+(?:-[\w.-]+)?)?$/;

export function parseSource(
  arg: string,
  // `pnpm mod …` runs the CLI from tooling/mod (pnpm -F), so a relative zip
  // path resolves against INIT_CWD: the directory the user ran pnpm in.
  // Set by pnpm at run time; not a build input, so turbo needn't hash it.
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  baseDir = process.env.INIT_CWD ?? process.cwd(),
): Source {
  if (isDreamSource(arg)) return { kind: "registry", location: arg };
  if (BARE_SLUG.test(arg))
    return { kind: "registry", location: `dream:${arg}` };
  if (arg.endsWith(".zip"))
    return { kind: "zip", location: path.resolve(baseDir, arg) };
  const [url, ref] = arg.split("#");
  if (!url) throw new Error(`unparseable source "${arg}"`);
  return { kind: "github", location: url, ref };
}

/** Unzip into a temp dir, tolerating a single top-level folder in the zip. */
function unzipToTemp(zipPath: string): string {
  const tmp = mkdtempSync(path.join(tmpdir(), "mod-src-"));
  execFileSync("unzip", ["-q", zipPath, "-d", tmp]);
  const entries = readdirSync(tmp);
  return entries.length === 1 && entries[0] && !entries[0].includes(".")
    ? path.join(tmp, entries[0])
    : tmp;
}

/**
 * Clone (github), unzip (zip) or download from the Dream registry
 * (registry) into a temp dir whose root is the package root.
 */
async function fetchSource(
  repoRoot: string,
  src: Source,
): Promise<{
  dir: string;
  commit?: string;
  ref?: string;
  /** Set for registry sources — becomes the lock's source entry. */
  registry?: Extract<ModSource, { type: "registry" }>;
}> {
  if (src.kind === "zip") return { dir: unzipToTemp(src.location) };

  if (src.kind === "registry") {
    const dreamRef = parseDreamSource(src.location);
    requireOpsToken();
    const registry = registryUrl();
    const grant = await requestDownload({
      registry,
      licenseKey: requireLicenseKey(),
      slug: dreamRef.slug,
      version: src.ref ?? dreamRef.version,
      kitVersion: KIT_VERSION,
      repo: repoIdentity(repoRoot),
    });
    // The signed URL expires in minutes — download (and verify) immediately.
    const tmp = mkdtempSync(path.join(tmpdir(), "mod-dl-"));
    const zipFile = path.join(tmp, `${grant.slug}.zip`);
    await downloadVerified(grant.url, grant.sha256, zipFile);
    return {
      dir: unzipToTemp(zipFile),
      registry: {
        type: "registry",
        registry,
        slug: grant.slug,
        version: grant.version,
        sha256: grant.sha256,
      },
    };
  }

  const tmp = mkdtempSync(path.join(tmpdir(), "mod-src-"));

  let ref = src.ref;
  if (!ref) {
    // Latest semver tag.
    const out = execFileSync(
      "git",
      ["ls-remote", "--tags", "--refs", src.location],
      { encoding: "utf8" },
    );
    const tags = out
      .split("\n")
      .map((l) => l.split("\t")[1]?.replace("refs/tags/", "") ?? "")
      .map((t) => (t.startsWith("v") ? t.slice(1) : t))
      .filter((t) => semver.valid(t))
      .sort(semver.compare);
    const latest = tags.at(-1);
    if (!latest) throw new Error(`no semver tags found at ${src.location}`);
    ref = `v${latest}`;
  }
  execFileSync(
    "git",
    ["clone", "--depth", "1", "--branch", ref, src.location, tmp],
    { stdio: "pipe" },
  );
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: tmp,
    encoding: "utf8",
  }).trim();
  rmSync(path.join(tmp, ".git"), { recursive: true, force: true });
  return { dir: tmp, commit, ref };
}

/** The registry catalog, or null when it's unreachable (fetched once). */
let catalogPromise: Promise<CatalogModule[] | null> | undefined;
function registryCatalog(): Promise<CatalogModule[] | null> {
  catalogPromise ??= fetchCatalog(registryUrl()).catch(() => null);
  return catalogPromise;
}

/**
 * Fetch the plan's primary source; if it fails and the plan has a GitHub
 * fallback, say why and fetch that instead. Returns the source actually used.
 */
async function fetchPlanned(
  repoRoot: string,
  plan: SourcePlan,
): Promise<{ fetched: Awaited<ReturnType<typeof fetchSource>>; used: Source }> {
  try {
    return {
      fetched: await fetchSource(repoRoot, plan.primary),
      used: plan.primary,
    };
  } catch (err) {
    if (!plan.fallback) throw err;
    const why = err instanceof Error ? err.message : String(err);
    console.warn(
      `mod: ${plan.primary.location} unavailable (${why}) — falling back to ${plan.fallback.location}`,
    );
    return {
      fetched: await fetchSource(repoRoot, plan.fallback),
      used: plan.fallback,
    };
  }
}

/** The lock's source entry for what was actually fetched. */
function lockSource(
  used: Source,
  fetched: Awaited<ReturnType<typeof fetchSource>>,
  repo: string | undefined,
): ModSource {
  if (fetched.registry) {
    return { ...fetched.registry, ...(repo ? { repo } : {}) };
  }
  if (used.kind === "zip") {
    return {
      type: "zip",
      sha256: sha256File(used.location),
      filename: path.basename(used.location),
    };
  }
  return {
    type: "github",
    repo: used.location,
    ref: fetched.ref ?? "",
    commit: fetched.commit ?? "",
  };
}

function readManifestBasics(dir: string): { slug: string; version: string } {
  const config = path.join(dir, "module.config.ts");
  if (!existsSync(config)) {
    throw new Error("source has no module.config.ts at its root");
  }
  const text = readFileSync(config, "utf8");
  const slug = SLUG_FROM_CONFIG.exec(text)?.[1];
  const version = VERSION_FROM_CONFIG.exec(text)?.[1];
  if (!slug || !version) {
    throw new Error("could not read slug/version from module.config.ts");
  }
  return { slug, version };
}

async function validateAndSync(repoRoot: string): Promise<void> {
  installWorkspace(repoRoot);
  await sync(repoRoot); // loadModules inside throws on any validation error
}

/**
 * `pnpm mod add <github-url[#vX.Y.Z] | path.zip | dream:<slug>[@x.y.z] | <slug>>`
 *
 * Registry-first: a GitHub URL the registry lists installs from the registry
 * (falling back to the repo); `dream:<slug>` falls back to the module's
 * public repo when the registry can't serve it.
 */
export async function add(repoRoot: string, sourceArg: string): Promise<void> {
  const src = parseSource(sourceArg);
  const catalog = src.kind === "zip" ? null : await registryCatalog();
  const plan = planAdd(src, catalog, { registryFirst: registryFirstEnabled() });
  const { fetched, used } = await fetchPlanned(repoRoot, plan);
  const { slug, version } = readManifestBasics(fetched.dir);
  if (fetched.registry && fetched.registry.slug !== slug) {
    throw new Error(
      `the registry sent "${slug}" when "${fetched.registry.slug}" was requested — aborting`,
    );
  }

  const dest = toAbs(repoRoot, `modules/${slug}`);
  if (existsSync(dest)) {
    throw new Error(`modules/${slug} already exists — use \`mod update\``);
  }

  cpSync(fetched.dir, dest, { recursive: true });
  try {
    await validateAndSync(repoRoot);
  } catch (err) {
    rmSync(dest, { recursive: true, force: true });
    throw err;
  }

  const baseCommit = snapshotModule(repoRoot, slug, version);
  const lock = readLock(repoRoot);
  const entry = lock.modules[slug];
  if (entry) {
    entry.baseCommit = baseCommit;
    entry.installedVia = "cli";
    entry.source = lockSource(
      used,
      fetched,
      fallbackRepo(plan, undefined, findInCatalog(catalog, { slug })?.repo),
    );
    writeLock(repoRoot, lock);
  }

  console.log(
    `\nInstalled ${slug}@${version}. Next: pnpm db:reset && pnpm db:gen-types` +
      ` (and pnpm cms:gen-types if it has CMS surface), pnpm typecheck, commit.`,
  );
}

function sha256File(file: string): string {
  const out = execFileSync("sha256sum", [file], { encoding: "utf8" });
  return out.split(" ")[0] ?? "";
}

/**
 * The three-way-merge step of `mod update`: base = the pinned pristine
 * snapshot, ours = modules/<slug>/ as it is now (local edits included),
 * theirs = the new upstream tree at `upstreamDir`. Writes the merged tree
 * (conflict markers included) into modules/<slug>/ and advances
 * refs/mod-base/<slug>.
 *
 * `theirs` doubles as the new pristine base, so it is committed with the
 * previous base as its parent: the ref only ever moves forward (all old bases
 * stay reachable, and `git push origin 'refs/mod-base/*'` fast-forwards). On
 * any failure modules/<slug>/ is restored and the ref is left alone.
 */
export function mergeUpstream(
  repoRoot: string,
  slug: string,
  upstreamDir: string,
  version: string,
  pinnedBase: string,
): { baseCommit: string; conflicts: string[] } {
  const base = rerootLegacyBase(repoRoot, slug, pinnedBase);
  const ours = commitModuleTree(repoRoot, slug, `ours: ${slug}`);

  const moduleDir = toAbs(repoRoot, `modules/${slug}`);
  const backup = mkdtempSync(path.join(tmpdir(), "mod-backup-"));
  cpSync(moduleDir, path.join(backup, slug), { recursive: true });
  try {
    // theirs = new upstream, staged at the same path
    rmSync(moduleDir, { recursive: true, force: true });
    cpSync(upstreamDir, moduleDir, { recursive: true });
    const theirs = commitModuleTree(
      repoRoot,
      slug,
      `mod-base: ${slug} v${version}`,
      base,
    );

    const merged = mergeTrees(repoRoot, base, ours, theirs);
    checkoutModuleTree(repoRoot, slug, merged.tree);
    git(repoRoot, ["update-ref", `refs/mod-base/${slug}`, theirs]);
    return { baseCommit: theirs, conflicts: merged.conflicts };
  } catch (err) {
    rmSync(moduleDir, { recursive: true, force: true });
    cpSync(path.join(backup, slug), moduleDir, { recursive: true });
    throw err;
  } finally {
    rmSync(backup, { recursive: true, force: true });
  }
}

/**
 * `pnpm mod update <slug> [--to vX.Y.Z] [--from <source>] [--continue]`
 *
 * Registry-first: a module the registry lists updates from it (and its lock
 * origin moves there), falling back to its GitHub repo when the registry
 * can't serve it. `--from` forces an origin for this and later updates
 * (`--from dream:crm`, or a GitHub url to leave the registry — combine with
 * MOD_REGISTRY_FIRST=off to keep it there). The source must serve the same
 * slug; local edits still 3-way merge.
 */
export async function update(
  repoRoot: string,
  slug: string,
  opts: { to?: string; from?: string; cont?: boolean },
): Promise<void> {
  const lock = readLock(repoRoot);
  const entry = lock.modules[slug];
  if (!entry) throw new Error(`"${slug}" is not installed`);

  if (opts.cont) {
    // Conflicts were resolved by hand — finish bookkeeping. The stopped
    // update already advanced the lock to the new chained base; re-point the
    // ref at it in case a forced fetch of refs/mod-base/* moved it since.
    if (entry.baseCommit) {
      try {
        git(repoRoot, [
          "update-ref",
          `refs/mod-base/${slug}`,
          entry.baseCommit,
        ]);
      } catch {
        console.warn(
          `warning: lock baseCommit ${entry.baseCommit} for "${slug}" is not in this clone; refs/mod-base/${slug} left as is.`,
        );
      }
    }
    await validateAndSync(repoRoot);
    console.log(`Update of ${slug} completed.`);
    return;
  }

  let plan: SourcePlan | null;
  let catalog: CatalogModule[] | null = null;
  if (opts.from) {
    const src = parseSource(opts.from);
    if (src.kind === "zip") {
      throw new Error(
        `--from takes a GitHub url or dream:<slug> — a zip has no later versions to update from`,
      );
    }
    // --to wins over a version embedded in the source (url#vX / dream:x@y).
    if (opts.to) src.ref = opts.to;
    if (src.kind === "registry") src.ref = src.ref?.replace(/^v/, "");
    plan = { primary: src }; // explicit: no fallback
  } else {
    const registryFirst = registryFirstEnabled();
    if (typeof entry.source === "object" && entry.source.type !== "zip") {
      catalog = await registryCatalog();
    }
    plan = planUpdate(slug, entry.source, catalog, {
      registryFirst,
      to: opts.to,
    });
  }
  if (!plan) {
    throw new Error(
      `"${slug}" has a ${typeof entry.source === "string" ? entry.source : entry.source.type} origin — update it with --from <github-url|dream:${slug}>`,
    );
  }
  assertMergeTreeSupport(); // before fetching or touching modules/<slug>/

  const { fetched, used } = await fetchPlanned(repoRoot, plan);
  const { slug: fetchedSlug, version: newVersion } = readManifestBasics(
    fetched.dir,
  );
  if (fetchedSlug !== slug) {
    throw new Error(
      `the source serves "${fetchedSlug}", not "${slug}" — aborting the update`,
    );
  }

  const pinnedBase = entry.baseCommit ?? currentBase(repoRoot, slug);
  if (!pinnedBase) {
    throw new Error(
      `no pristine base for "${slug}" — refs/mod-base/${slug} is missing and the lock has no baseCommit`,
    );
  }

  const merged = mergeUpstream(
    repoRoot,
    slug,
    fetched.dir,
    newVersion,
    pinnedBase,
  );
  // The new pristine base is the upstream tree regardless of merge outcome,
  // so the lock is final here even when conflicts stop the update: `--continue`
  // only re-validates and syncs once the markers are resolved.
  entry.baseCommit = merged.baseCommit;
  entry.version = newVersion;
  entry.source = lockSource(
    used,
    fetched,
    fallbackRepo(plan, entry.source, findInCatalog(catalog, { slug })?.repo),
  );
  writeLock(repoRoot, lock);

  if (merged.conflicts.length > 0) {
    console.error(
      `\nMerge conflicts in:\n  - ${merged.conflicts.join("\n  - ")}\n` +
        `Resolve the markers, then run: pnpm mod update ${slug} --continue`,
    );
    process.exitCode = 1;
    return;
  }

  await validateAndSync(repoRoot);
  console.log(`Updated ${slug} to ${newVersion}.`);
}

/** `pnpm mod remove <slug> [--keep-data]` */
export async function remove(
  repoRoot: string,
  slug: string,
  opts: { keepData?: boolean },
): Promise<void> {
  const mods = await loadModules(repoRoot);
  const target = mods.find((e) => e.manifest.slug === slug);
  if (!target) throw new Error(`"${slug}" is not installed`);

  const dependents = mods.filter((e) => e.manifest.requires.includes(slug));
  if (dependents.length > 0) {
    throw new Error(
      `cannot remove "${slug}": required by ${dependents
        .map((d) => d.manifest.slug)
        .join(", ")} — remove those first`,
    );
  }

  // 1. Host drop migration (data teardown) unless --keep-data.
  if (!opts.keepData && target.manifest.database.tables.length > 0) {
    const dropFile = path.join(target.dir, "supabase/drop.sql");
    const dropSql = existsSync(dropFile)
      ? readFileSync(dropFile, "utf8")
      : target.manifest.database.tables
          .map((t) => `drop table if exists public.${t} cascade;`)
          .join("\n") + "\n";
    const hostDir = toAbs(repoRoot, MOD_PATHS.supabaseMigrationsDir);
    const taken = new Set(
      readdirSync(hostDir)
        .filter((f) => f.endsWith(".sql"))
        .map((f) => f.slice(0, 14)),
    );
    const pins = readPins(repoRoot);
    for (const pin of Object.values(pins.pins)) taken.add(pin.version);
    const version = nextVersion(taken, new Date());
    writeFileSync(
      path.join(hostDir, `${version}_drop_mod_${slug.replace(/-/g, "_")}.sql`),
      `-- Teardown for the removed "${slug}" module (pnpm mod remove).\n${dropSql}`,
    );
  }

  // 2. CMS drop scaffold (best-effort) into the CORE migrations dir — the
  //    module package is about to vanish.
  const cms = target.manifest.cms;
  const cmsSlugs = [
    ...cms.collections,
    ...cms.globals,
    ...(cms.hasSettings ? [`mod-${slug}-settings`] : []),
  ];
  if (!opts.keepData && cmsSlugs.length > 0) {
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace("T", "_")
      .slice(0, 15);
    const name = `${stamp}_drop_mod_${slug.replace(/-/g, "_")}`;
    const drops = cmsSlugs
      .flatMap((s) => {
        const snake = s.replace(/-/g, "_");
        return [snake, `${snake}_rels`, `_${snake}_v`, `_${snake}_v_rels`];
      })
      .map((t) => `  DROP TABLE IF EXISTS "cms"."${t}" CASCADE;`)
      .join("\n");
    const dir = toAbs(repoRoot, "apps/nextjs/src/payload/migrations");
    writeFileSync(
      path.join(dir, `${name}.ts`),
      `import { MigrateDownArgs, MigrateUpArgs, sql } from "@payloadcms/db-postgres";

// Best-effort teardown for the removed "${slug}" module's cms tables
// (pnpm mod remove). VERIFY the table list — array/child tables may differ.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql\`
${drops}
  \`);
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Irreversible — restore from a backup if needed.
}
`,
    );
    const indexFile = path.join(dir, "index.ts");
    const idx = readFileSync(indexFile, "utf8");
    writeFileSync(
      indexFile,
      idx
        .replace(
          /^export const migrations = \[/m,
          `import * as migration_${name} from "./${name}";\n\nexport const migrations = [`,
        )
        .replace(
          /\];\s*$/,
          `  {\n    up: migration_${name}.up,\n    down: migration_${name}.down,\n    name: "${name}",\n  },\n];\n`,
        ),
    );
  }

  // 3. Remove copied edge functions, the vendored dir, and the base ref;
  //    tombstone the lock (version pins are never reused).
  const lock = readLock(repoRoot);
  for (const fn of lock.modules[slug]?.edgeFunctions ?? []) {
    rmSync(toAbs(repoRoot, `supabase/functions/${fn}`), {
      recursive: true,
      force: true,
    });
  }
  rmSync(target.dir, { recursive: true, force: true });
  try {
    git(repoRoot, ["update-ref", "-d", `refs/mod-base/${slug}`]);
  } catch {
    /* no ref */
  }
  const removedVersion = lock.modules[slug]?.version ?? "unknown";
  lock.tombstones[slug] = { removedAtVersion: removedVersion };
  writeLock(repoRoot, lock);

  // 4. Regenerate everything (drops the registries/stubs/lock entry).
  await sync(repoRoot);
  console.log(
    `Removed ${slug}${opts.keepData ? " (data kept — tables orphaned but harmless)" : ""}. ` +
      `Run pnpm db:reset locally; review the generated drop migration(s) before deploying.`,
  );
}

/**
 * Registry modules' upstream state: one entitlements + catalog fetch per
 * distinct registry. Entitlement/network problems become calm license
 * states (updates simply pause) — status never crashes on them.
 */
type LicenseState = "active" | "inactive" | "no-key" | "unknown" | "disabled";

async function registryStates(
  modules: Record<string, ModLockEntry>,
): Promise<Map<string, { latest: string | null; license: LicenseState }>> {
  const states = new Map<
    string,
    { latest: string | null; license: LicenseState }
  >();
  const byRegistry = new Map<
    string,
    { slug: string; source: Extract<ModSource, { type: "registry" }> }[]
  >();
  for (const [slug, entry] of Object.entries(modules)) {
    if (typeof entry.source !== "object" || entry.source.type !== "registry") {
      continue;
    }
    const list = byRegistry.get(entry.source.registry) ?? [];
    list.push({ slug, source: entry.source });
    byRegistry.set(entry.source.registry, list);
  }

  // No module ops → paid modules are off: report it, call nothing.
  if (!opsToken()) {
    for (const mods of byRegistry.values()) {
      for (const mod of mods) {
        states.set(mod.slug, { latest: null, license: "disabled" });
      }
    }
    return states;
  }

  const key = licenseKey();
  for (const [registry, mods] of byRegistry) {
    let license: LicenseState = key ? "active" : "no-key";
    let entitled: Set<string> | null = null;
    if (key) {
      const ent = await fetchEntitlements({ registry, licenseKey: key });
      if (ent.status === "active") {
        entitled = new Set(ent.entitlements.map((e) => e.slug));
      } else if (ent.status === "inactive") {
        license = "inactive";
      } else {
        license = "unknown"; // network problem — report nothing, quietly
      }
    }
    const catalog = new Map<string, CatalogModule>();
    if (license === "active") {
      try {
        for (const mod of await fetchCatalog(registry)) {
          catalog.set(mod.slug, mod);
        }
      } catch {
        // catalog unreachable — no update info, still report license state
      }
    }
    for (const mod of mods) {
      const perModule: LicenseState =
        license === "active" && entitled && !entitled.has(mod.source.slug)
          ? "inactive"
          : license;
      states.set(mod.slug, {
        latest:
          perModule === "active"
            ? latestCompatible(catalog.get(mod.source.slug))
            : null,
        license: perModule,
      });
    }
  }
  return states;
}

const LICENSE_NOTES: Partial<Record<LicenseState, string>> = {
  inactive: "license inactive — updates paused",
  disabled: "paid modules off — set MOD_OPS_TOKEN (module ops)",
  "no-key": "no license key — updates paused",
};

/** `pnpm mod list` / `pnpm mod status [--json]` */
export async function status(
  repoRoot: string,
  opts: { json?: boolean; checkUpstream?: boolean },
): Promise<void> {
  const lock = readLock(repoRoot);
  // Registry-first: a GitHub-origin module the registry lists is checked
  // there (its next `update` moves it to the registry) — no ls-remote, so a
  // private repo needs no token access. Falls back to ls-remote below when
  // the registry has nothing for it.
  const viaRegistry = new Set<string>();
  const upstreamSources: Record<string, ModLockEntry> = { ...lock.modules };
  if (opts.checkUpstream && registryFirstEnabled()) {
    const catalog = await registryCatalog();
    for (const [slug, entry] of Object.entries(lock.modules)) {
      if (typeof entry.source !== "object" || entry.source.type !== "github") {
        continue;
      }
      const listed = findInCatalog(catalog, {
        slug,
        repo: entry.source.repo,
      });
      if (!listed) continue;
      viaRegistry.add(slug);
      upstreamSources[slug] = {
        ...entry,
        source: {
          type: "registry",
          registry: registryUrl(),
          slug: listed.slug,
          version: entry.version,
          sha256: "",
        },
      };
    }
  }
  const registry = opts.checkUpstream
    ? await registryStates(upstreamSources)
    : new Map<string, { latest: string | null; license: LicenseState }>();

  const rows = Object.entries(lock.modules).map(([slug, entry]) => {
    const modified = entry.baseCommit
      ? modifiedFiles(
          repoRoot,
          slug,
          rerootLegacyBase(repoRoot, slug, entry.baseCommit),
        )
      : [];
    let latest: string | null = null;
    let license: LicenseState | undefined;
    const regState = registry.get(slug);
    if (regState) {
      latest = regState.latest;
      // A GitHub-origin module isn't licensed through the registry — don't
      // report a license state for it.
      if (!viaRegistry.has(slug)) license = regState.license;
    }
    if (
      opts.checkUpstream &&
      latest === null &&
      typeof entry.source === "object" &&
      entry.source.type === "github"
    ) {
      try {
        const out = execFileSync(
          "git",
          ["ls-remote", "--tags", "--refs", entry.source.repo],
          { encoding: "utf8" },
        );
        latest =
          out
            .split("\n")
            .map((l) => l.split("\t")[1]?.replace("refs/tags/v", "") ?? "")
            .filter((t) => semver.valid(t))
            .sort(semver.compare)
            .at(-1) ?? null;
      } catch {
        latest = null;
      }
    }
    return {
      slug,
      version: entry.version,
      source:
        typeof entry.source === "string" ? entry.source : entry.source.type,
      pinned: entry.pinned ?? false,
      modifiedFiles: modified.length,
      latest,
      ...(license ? { license } : {}),
      updateAvailable:
        latest !== null && semver.gt(latest, entry.version) && !entry.pinned,
    };
  });

  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  for (const r of rows) {
    const note = r.license ? LICENSE_NOTES[r.license] : undefined;
    console.log(
      `${r.slug}@${r.version} [${r.source}]` +
        (r.pinned ? " pinned" : "") +
        (r.modifiedFiles > 0 ? ` modified(${r.modifiedFiles})` : "") +
        (r.updateAvailable ? ` → ${r.latest} available` : "") +
        (note ? ` — ${note}` : ""),
    );
  }
}

/** `pnpm mod payload-migrate <slug> <desc>` — §3.2's one-command wrapper. */
// eslint-disable-next-line @typescript-eslint/require-await
export async function payloadMigrate(
  repoRoot: string,
  slug: string,
  desc: string,
): Promise<void> {
  const name = `mod_${slug.replace(/-/g, "_")}_${desc}`;
  execSync(`pnpm cms:migrate:create ${name}`, {
    cwd: repoRoot,
    stdio: "inherit",
  });
  const hostDir = toAbs(repoRoot, "apps/nextjs/src/payload/migrations");
  const created = readdirSync(hostDir)
    .filter((f) => f.endsWith(`_${name}.ts`))
    .sort()
    .at(-1);
  if (!created) throw new Error("migrate:create produced no migration");
  const migName = created.replace(/\.ts$/, "");

  // Relocate the .ts into the module (the .json snapshot stays in the host
  // dir for schema-diff continuity) and deregister it from the core index.
  const modMigDir = toAbs(repoRoot, `modules/${slug}/src/payload/migrations`);
  execSync(`mkdir -p ${JSON.stringify(modMigDir)}`);
  cpSync(path.join(hostDir, created), path.join(modMigDir, created));
  rmSync(path.join(hostDir, created));
  const indexFile = path.join(hostDir, "index.ts");
  const idx = readFileSync(indexFile, "utf8")
    .replace(
      new RegExp(
        `import \\* as migration_${migName} from '\\./${migName}';\\n`,
      ),
      "",
    )
    .replace(
      new RegExp(
        `  \\{\\n    up: migration_${migName}\\.up,\\n    down: migration_${migName}\\.down,\\n    name: '${migName}'\\n?,?\\n?  \\},\\n`,
      ),
      "",
    );
  writeFileSync(indexFile, idx);

  console.log(
    `Created modules/${slug}/src/payload/migrations/${created}.\n` +
      `Export it from the module's ./payload \`migrations\` array, set ` +
      `cms.hasMigrations: true in its manifest, then run pnpm mod sync.`,
  );
}

/** `pnpm mod eject <slug> --repo <url>` — publish to its own repo. */
// eslint-disable-next-line @typescript-eslint/require-await
export async function eject(
  repoRoot: string,
  slug: string,
  repoUrl: string,
): Promise<void> {
  const lock = readLock(repoRoot);
  const entry = lock.modules[slug];
  if (!entry) throw new Error(`"${slug}" is not installed`);

  const tmp = mkdtempSync(path.join(tmpdir(), "mod-eject-"));
  cpSync(toAbs(repoRoot, `modules/${slug}`), tmp, { recursive: true });
  // Drop in the template module CI (validates tag/version match, then
  // installs the module into a fresh kit clone and runs the full gates).
  const ciTemplate = toAbs(repoRoot, "tooling/mod/templates/module-ci.yml");
  if (existsSync(ciTemplate)) {
    cpSync(ciTemplate, path.join(tmp, ".github/workflows/ci.yml"));
  }
  const run = (args: string[]) =>
    execFileSync("git", args, { cwd: tmp, stdio: "pipe", encoding: "utf8" });
  run(["init", "-b", "main"]);
  run(["add", "-A"]);
  run(["commit", "-m", `${slug} v${entry.version}`]);
  run(["tag", `v${entry.version}`]);
  run(["remote", "add", "origin", repoUrl]);
  run(["push", "-u", "origin", "main", "--tags"]);
  const commit = run(["rev-parse", "HEAD"]).trim();
  rmSync(tmp, { recursive: true, force: true });

  entry.source = {
    type: "github",
    repo: repoUrl,
    ref: `v${entry.version}`,
    commit,
  };
  entry.baseCommit = snapshotModule(repoRoot, slug, entry.version);
  writeLock(repoRoot, lock);
  console.log(`Ejected ${slug} to ${repoUrl} (tag v${entry.version}).`);
}

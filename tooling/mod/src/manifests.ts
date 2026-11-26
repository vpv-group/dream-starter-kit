import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import semver from "semver";

import type { ModuleManifest } from "@acme/mod-kit";
import { KIT_VERSION } from "@acme/config";
import {
  envPrefixes,
  lintModuleSql,
  moduleManifestSchema,
  validateManifest,
  validateManifestSet,
} from "@acme/mod-kit";

import { MOD_PATHS, toAbs } from "./paths";

/** A vendored module, loaded + validated from modules/<slug>/. */
export interface LoadedModule {
  manifest: ModuleManifest;
  /** Absolute path of modules/<slug>. */
  dir: string;
  /** @acme/mod-<slug> */
  packageName: string;
  /**
   * Client env keys declared in ./env (UNPREFIXED form `MOD_<SLUG>_*`) — the
   * generated env modules map them to NEXT_PUBLIC_* / EXPO_PUBLIC_* reads.
   */
  envClientKeys: string[];
  /** Server env keys declared in ./env (`MOD_<SLUG>_*`). */
  envServerKeys: string[];
  /**
   * Payload migrations shipped under src/payload/migrations (cms.hasMigrations)
   * — sync materializes copies into the host migrationDir so the local
   * `payload migrate` CLI applies them (production applies the same names via
   * prodMigrations; the cms ledger dedupes).
   */
  payloadMigrations: { name: string; content: string }[];
  /**
   * Native packages this module adds to the Expo app (name → range): its
   * `expo-*` / `react-native-*` dependencies that the app doesn't already
   * list. Recorded in native.generated.json; a change needs a new native build.
   */
  nativePackages: Record<string, string>;
}

const NATIVE_PACKAGE =
  /^(expo$|expo-|@expo\/|react-native$|react-native-|@react-native)/;

/**
 * A module's native dependencies, checked against the Expo app's own:
 * host-provided packages must use a compatible range (they're the app's
 * copy); other `expo-*` packages must target the app's Expo SDK major.
 * Returns the packages the module adds, plus any problems.
 */
export function nativeDependencies(
  slug: string,
  deps: Record<string, string>,
  hostDeps: Record<string, string>,
): { packages: Record<string, string>; errors: string[] } {
  const errors: string[] = [];
  const packages: Record<string, string> = {};
  const sdk = hostDeps.expo
    ? semver.minVersion(hostDeps.expo)?.major
    : undefined;
  for (const [name, range] of Object.entries(deps).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!NATIVE_PACKAGE.test(name)) continue;
    if (range.startsWith("workspace:") || range.startsWith("catalog:"))
      continue;
    const host = hostDeps[name];
    if (host) {
      if (
        semver.validRange(host) &&
        semver.validRange(range) &&
        !semver.intersects(host, range)
      ) {
        errors.push(
          `[${slug}] ${name}@"${range}" doesn't match the app's "${host}" (apps/expo/package.json) — use "${host}"`,
        );
      }
      continue;
    }
    const major = semver.validRange(range)
      ? semver.minVersion(range)?.major
      : undefined;
    if (name.startsWith("expo-") && sdk !== undefined && major !== sdk) {
      errors.push(
        `[${slug}] ${name}@"${range}" targets Expo SDK ${major ?? "?"}, but the app is on SDK ${sdk} — use "~${sdk}.0.0" (the version \`npx expo install ${name}\` picks)`,
      );
    }
    packages[name] = range;
  }
  return { packages, errors };
}

interface EnvModule {
  default?: {
    server?: Record<string, unknown>;
    client?: Record<string, unknown>;
  };
}

export class ModValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`module validation failed:\n  - ${errors.join("\n  - ")}`);
  }
}

/**
 * Discover, load and validate every module under modules/*. Throws
 * ModValidationError with ALL problems aggregated. Returns modules sorted
 * by slug (the deterministic order every generated registry uses).
 */
export async function loadModules(repoRoot: string): Promise<LoadedModule[]> {
  const modDir = toAbs(repoRoot, MOD_PATHS.modulesDir);
  if (!existsSync(modDir)) return [];

  const dirs = readdirSync(modDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();

  const errors: string[] = [];
  const loaded: LoadedModule[] = [];
  const expoPkgFile = toAbs(repoRoot, MOD_PATHS.expoPackageJson);
  const hostDeps = existsSync(expoPkgFile)
    ? ((
        JSON.parse(readFileSync(expoPkgFile, "utf8")) as {
          dependencies?: Record<string, string>;
        }
      ).dependencies ?? {})
    : {};

  for (const dirName of dirs) {
    const dir = path.join(modDir, dirName);
    const configFile = path.join(dir, "module.config.ts");
    if (!existsSync(configFile)) {
      errors.push(`modules/${dirName}/ has no module.config.ts`);
      continue;
    }

    let manifest: ModuleManifest;
    try {
      const mod = (await import(pathToFileURL(configFile).href)) as {
        default?: unknown;
      };
      manifest = moduleManifestSchema.parse(mod.default);
    } catch (err) {
      errors.push(
        `modules/${dirName}/module.config.ts failed to load: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }

    if (manifest.slug !== dirName) {
      errors.push(
        `modules/${dirName}/ manifest slug is "${manifest.slug}" — directory and slug must match`,
      );
    }

    const packageName = `@acme/mod-${manifest.slug}`;
    const pkgFile = path.join(dir, "package.json");
    let nativePackages: Record<string, string> = {};
    if (!existsSync(pkgFile)) {
      errors.push(`[${manifest.slug}] missing package.json`);
    } else {
      const pkg = JSON.parse(readFileSync(pkgFile, "utf8")) as {
        name?: string;
        version?: string;
        dependencies?: Record<string, string>;
        exports?: Record<string, unknown>;
      };
      const native = nativeDependencies(
        manifest.slug,
        pkg.dependencies ?? {},
        hostDeps,
      );
      nativePackages = native.packages;
      errors.push(...native.errors);
      if (manifest.native.plugin) {
        if (!existsSync(path.join(dir, "app.plugin.js"))) {
          errors.push(
            `[${manifest.slug}] native.plugin is true but app.plugin.js is missing at the package root`,
          );
        }
        if (!pkg.exports || !("./app.plugin.js" in pkg.exports)) {
          errors.push(
            `[${manifest.slug}] native.plugin is true: add "./app.plugin.js": "./app.plugin.js" to package.json exports (Expo resolves the plugin through it)`,
          );
        }
      }
      if (pkg.name !== packageName) {
        errors.push(
          `[${manifest.slug}] package.json name "${pkg.name}" must be "${packageName}"`,
        );
      }
      if (pkg.version !== manifest.version) {
        errors.push(
          `[${manifest.slug}] package.json version "${pkg.version}" must match manifest version "${manifest.version}"`,
        );
      }
    }

    if (!semver.satisfies(KIT_VERSION, manifest.kitCompat)) {
      errors.push(
        `[${manifest.slug}] kitCompat "${manifest.kitCompat}" does not include kit version ${KIT_VERSION}`,
      );
    }

    errors.push(...validateManifest(manifest));

    // Env contract: enumerate ./env keys (sync bakes them into the generated
    // env modules) and enforce the MOD_<SLUG>_ prefix.
    let envClientKeys: string[] = [];
    let envServerKeys: string[] = [];
    if (manifest.env.hasServer || manifest.env.hasClient) {
      const envFile = path.join(dir, "src/env.ts");
      if (!existsSync(envFile)) {
        errors.push(
          `[${manifest.slug}] env.hasServer/hasClient set but src/env.ts is missing`,
        );
      } else {
        try {
          const mod = (await import(pathToFileURL(envFile).href)) as EnvModule;
          envServerKeys = Object.keys(mod.default?.server ?? {}).sort();
          envClientKeys = Object.keys(mod.default?.client ?? {}).sort();
        } catch (err) {
          errors.push(
            `[${manifest.slug}] src/env.ts failed to load: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        const serverPrefix = envPrefixes(manifest.slug)[0] ?? "";
        for (const key of [...envServerKeys, ...envClientKeys]) {
          if (!key.startsWith(serverPrefix)) {
            errors.push(
              `[${manifest.slug}] env key "${key}" must be prefixed "${serverPrefix}" (codegen adds NEXT_PUBLIC_/EXPO_PUBLIC_ for client keys)`,
            );
          }
        }
        if (manifest.env.hasServer && envServerKeys.length === 0) {
          errors.push(
            `[${manifest.slug}] env.hasServer is true but src/env.ts exports no server shape`,
          );
        }
        if (manifest.env.hasClient && envClientKeys.length === 0) {
          errors.push(
            `[${manifest.slug}] env.hasClient is true but src/env.ts exports no client shape`,
          );
        }
      }
    }

    const payloadMigrations: { name: string; content: string }[] = [];
    if (manifest.cms.hasMigrations) {
      const migDir = path.join(dir, "src/payload/migrations");
      if (existsSync(migDir)) {
        for (const f of readdirSync(migDir).sort()) {
          if (!/^\d{8}_\d{6}_.+\.ts$/.test(f)) continue;
          payloadMigrations.push({
            name: f.replace(/\.ts$/, ""),
            content: readFileSync(path.join(migDir, f), "utf8"),
          });
        }
      }
    }

    loaded.push({
      manifest,
      dir,
      packageName,
      envClientKeys,
      envServerKeys,
      payloadMigrations,
      nativePackages,
    });
  }

  const manifests = loaded.map((l) => l.manifest);
  errors.push(...validateManifestSet(manifests));

  // SQL ownership lint over each module's migrations + drop.sql.
  for (const mod of loaded) {
    const allowedDml = mod.manifest.database.dml;
    const sqlDir = path.join(mod.dir, "supabase/migrations");
    const sqlFiles = existsSync(sqlDir)
      ? readdirSync(sqlDir)
          .filter((f) => f.endsWith(".sql"))
          .sort()
          .map((f) => path.join(sqlDir, f))
      : [];
    const dropFile = path.join(mod.dir, "supabase/drop.sql");
    if (existsSync(dropFile)) sqlFiles.push(dropFile);
    for (const file of sqlFiles) {
      errors.push(
        ...lintModuleSql(readFileSync(file, "utf8"), {
          slug: mod.manifest.slug,
          file: path.relative(mod.dir, file),
          ownTables: mod.manifest.database.tables,
          allowedDmlTables: allowedDml,
          triggerTables: mod.manifest.database.triggersOn,
        }),
      );
    }
  }

  if (errors.length > 0) throw new ModValidationError(errors);
  return loaded;
}

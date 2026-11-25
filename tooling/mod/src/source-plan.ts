import type { ModSource } from "./lock";
import type { CatalogModule } from "./registry";
import { latestCompatible } from "./registry";

/**
 * Registry-first source planning (docs/MODULES.md → Where modules come from).
 *
 * The Dream registry is the default origin for every module it lists: `add`
 * and `update` try it first and fall back to the module's GitHub repo when
 * the registry can't serve it (no license key, not entitled, unreachable).
 * Modules the registry doesn't list keep their GitHub origin.
 *
 * Everything here is pure — the network calls live in lifecycle.ts.
 */

export interface Source {
  kind: "github" | "zip" | "registry";
  /** github: clean repo url; zip: file path; registry: dream:<slug>[@x.y.z]. */
  location: string;
  /** Requested version — tag (github, vX.Y.Z) or plain x.y.z (registry). */
  ref?: string;
}

export interface SourcePlan {
  primary: Source;
  /** Tried when the primary fails (always a GitHub repo). */
  fallback?: Source;
}

/** Comparable form of a GitHub repo URL (scheme, `.git`, case dropped). */
export function normalizeRepo(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^git@([^:]+):/, "$1/")
    .replace(/^[a-z+]+:\/\//, "")
    .replace(/^[^@/]+@/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
}

/**
 * The registry catalog entry for a module, matched by slug or by repo URL —
 * only when this kit can take one of its releases.
 */
export function findInCatalog(
  catalog: CatalogModule[] | null,
  match: { slug?: string; repo?: string },
  kitVersion?: string,
): CatalogModule | null {
  if (!catalog) return null;
  const repo = match.repo ? normalizeRepo(match.repo) : null;
  const entry = catalog.find(
    (m) =>
      (match.slug !== undefined && m.slug === match.slug) ||
      (repo !== null && m.repo !== undefined && normalizeRepo(m.repo) === repo),
  );
  if (!entry || latestCompatible(entry, kitVersion) === null) return null;
  return entry;
}

const toRegistryRef = (ref?: string) => ref?.replace(/^v/, "");
const toGithubRef = (ref?: string) =>
  ref === undefined ? undefined : ref.startsWith("v") ? ref : `v${ref}`;

function registrySource(slug: string, ref?: string): Source {
  return {
    kind: "registry",
    location: `dream:${slug}`,
    ref: toRegistryRef(ref),
  };
}

function githubSource(repo: string, ref?: string): Source {
  return { kind: "github", location: repo, ref: toGithubRef(ref) };
}

/** Where `pnpm mod add <source>` fetches from. */
export function planAdd(
  src: Source,
  catalog: CatalogModule[] | null,
  opts: { registryFirst: boolean; kitVersion?: string },
): SourcePlan {
  if (src.kind === "zip") return { primary: src };

  if (src.kind === "registry") {
    // dream:<slug> — fall back to the module's public repo, if it has one.
    const slug = /^dream:([^@]+)/.exec(src.location)?.[1];
    const entry = findInCatalog(catalog, { slug }, opts.kitVersion);
    const version = /@v?(.+)$/.exec(src.location)?.[1];
    return {
      primary: src,
      ...(entry?.repo
        ? { fallback: githubSource(entry.repo, src.ref ?? version) }
        : {}),
    };
  }

  // A GitHub URL — prefer the registry when it lists that repo.
  if (!opts.registryFirst) return { primary: src };
  const entry = findInCatalog(catalog, { repo: src.location }, opts.kitVersion);
  if (!entry) return { primary: src };
  return { primary: registrySource(entry.slug, src.ref), fallback: src };
}

/** Where `pnpm mod update <slug>` fetches from (without --from). */
export function planUpdate(
  slug: string,
  source: ModSource,
  catalog: CatalogModule[] | null,
  opts: { registryFirst: boolean; to?: string; kitVersion?: string },
): SourcePlan | null {
  if (typeof source !== "object") return null;

  if (source.type === "registry") {
    const repo =
      source.repo ??
      findInCatalog(catalog, { slug: source.slug }, opts.kitVersion)?.repo;
    return {
      primary: registrySource(source.slug, opts.to),
      ...(repo ? { fallback: githubSource(repo, opts.to) } : {}),
    };
  }

  if (source.type === "github") {
    const github = githubSource(source.repo, opts.to);
    if (!opts.registryFirst) return { primary: github };
    const entry = findInCatalog(
      catalog,
      { slug, repo: source.repo },
      opts.kitVersion,
    );
    if (!entry) return { primary: github };
    return { primary: registrySource(entry.slug, opts.to), fallback: github };
  }

  return null; // zip — no later versions to fetch
}

/** The GitHub repo to remember as a registry module's fallback. */
export function fallbackRepo(
  plan: SourcePlan,
  previous: ModSource | undefined,
  catalogRepo?: string,
): string | undefined {
  if (plan.fallback?.kind === "github") return plan.fallback.location;
  if (typeof previous === "object") {
    if (previous.type === "github") return previous.repo;
    if (previous.type === "registry" && previous.repo) return previous.repo;
  }
  return catalogRepo;
}

import semver from "semver";

import type { OpsPr } from "./ops-core";

/**
 * What the "Updates available" banner at the top of /admin shows (pure: no
 * env, no I/O, unit tested in outdated-core.test.ts). The route
 * (/api/modules/outdated) gathers the inputs; module-ops.yml still does the
 * real work, so this only decides what to OFFER:
 *
 * - the kit, when its newest published release is newer than KIT_VERSION;
 * - each module installed from GitHub or the Dream registry (the latter only
 *   while this site's license covers it) whose catalog `latest` is newer
 *   than the installed version. Bundled (`local`) modules ship with the kit,
 *   and pinned ones stay where the owner pinned them.
 *
 * Paused slugs ("I'll update it myself", `kit` for the kit) and skipped
 * versions (`<slug>@<version>`) from /admin → Updates are left out. A module
 * whose latest release needs a newer kit (`kitCompat`) is still listed when
 * the newest kit satisfies it, marked `needsKit`: it can update once the kit
 * update has merged. One the newest kit can't run either is left out.
 */

export interface OutdatedInput {
  kit: {
    /** KIT_VERSION. */
    current: string;
    /** Newest published kit release (`vX.Y.Z` or `X.Y.Z`), if known. */
    latest: string | null;
  };
  installed: { slug: string; name: string; version: string }[];
  lock: Record<string, { version: string; source: unknown; pinned?: boolean }>;
  catalog: { slug: string; latest?: string; kitCompat?: string }[];
  /** Registry modules this site's license covers. */
  entitled: ReadonlySet<string>;
  settings: { paused: string[]; skipped: string[] };
  /** Open update PRs (ops-core toOpsPrs). */
  prs: OpsPr[];
  /** Recent module-ops.yml runs. */
  runs: { status: string }[];
}

export interface PendingPr {
  number: number;
  url: string;
}

export interface OutdatedKit {
  from: string;
  to: string;
  /** An update PR is already open for it. */
  pr: PendingPr | null;
}

export interface OutdatedModule {
  slug: string;
  name: string;
  from: string;
  to: string;
  pr: PendingPr | null;
  /** Its latest release needs the kit update first. */
  needsKit: boolean;
}

export interface OutdatedState {
  kit: OutdatedKit | null;
  modules: OutdatedModule[];
  /** A module-ops run is queued or running right now. */
  running: boolean;
}

/** "v2.6.0" → "2.6.0"; null for anything that isn't a version. */
export function cleanVersion(v: string | null | undefined): string | null {
  return v ? semver.valid(semver.clean(v) ?? v) : null;
}

/** The lock's `source` field ("local", "github", "registry", or an object). */
function sourceOf(source: unknown): string {
  if (typeof source === "string") return source;
  if (source && typeof source === "object" && "type" in source) {
    return String(source.type);
  }
  return "unknown";
}

function satisfies(version: string | null, range: string | undefined) {
  if (!range) return true;
  if (!version) return false;
  try {
    return semver.satisfies(version, range);
  } catch {
    return false;
  }
}

function prFor(prs: OpsPr[], match: (pr: OpsPr) => boolean): PendingPr | null {
  const pr = prs.find(match);
  return pr ? { number: pr.number, url: pr.url } : null;
}

export function planOutdated(input: OutdatedInput): OutdatedState {
  const { settings, prs } = input;
  const paused = new Set(settings.paused);
  const skipped = new Set(settings.skipped);
  const isSkipped = (slug: string, version: string) =>
    skipped.has(`${slug}@${version}`) || skipped.has(`${slug}@v${version}`);

  const current = cleanVersion(input.kit.current);
  const latestKit = cleanVersion(input.kit.latest);
  const kit: OutdatedKit | null =
    current &&
    latestKit &&
    semver.gt(latestKit, current) &&
    !paused.has("kit") &&
    !isSkipped("kit", latestKit)
      ? {
          from: current,
          to: latestKit,
          pr: prFor(prs, (pr) => pr.kind === "kit"),
        }
      : null;

  const catalog = new Map(input.catalog.map((e) => [e.slug, e]));
  const modules: OutdatedModule[] = [];
  for (const mod of input.installed) {
    const entry = input.lock[mod.slug];
    if (!entry || entry.pinned || paused.has(mod.slug)) continue;
    const source = sourceOf(entry.source);
    const updatable =
      source === "github" ||
      (source === "registry" && input.entitled.has(mod.slug));
    if (!updatable) continue;

    const listed = catalog.get(mod.slug);
    const from = cleanVersion(mod.version);
    const to = cleanVersion(listed?.latest);
    if (!from || !to || !semver.gt(to, from) || isSkipped(mod.slug, to)) {
      continue;
    }
    const runsNow = satisfies(current, listed?.kitCompat);
    // Needs a kit this site can't get yet: nothing to offer.
    if (!runsNow && !(kit && satisfies(kit.to, listed?.kitCompat))) continue;

    modules.push({
      slug: mod.slug,
      name: mod.name,
      from,
      to,
      pr: prFor(prs, (pr) => pr.kind === "module" && pr.slug === mod.slug),
      needsKit: !runsNow,
    });
  }
  modules.sort((a, b) => a.name.localeCompare(b.name));

  return {
    kit,
    modules,
    running: input.runs.some((r) => r.status !== "completed"),
  };
}

/** The module-ops dispatches "Update all" sends (nothing already in a PR). */
export type UpdateOp = { op: "kit-update" } | { op: "update"; slug: string };

export function updateOps(state: OutdatedState): UpdateOp[] {
  const ops: UpdateOp[] = [];
  if (state.kit && !state.kit.pr) ops.push({ op: "kit-update" });
  for (const mod of state.modules) {
    // A module that needs the newer kit updates after the kit PR merges
    // (the daily check opens it then).
    if (!mod.pr && !mod.needsKit) ops.push({ op: "update", slug: mod.slug });
  }
  return ops;
}

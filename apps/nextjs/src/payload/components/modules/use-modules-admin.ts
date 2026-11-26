"use client";

import { useEffect, useSyncExternalStore } from "react";
import { toast } from "@payloadcms/ui";

/**
 * Shared client state for the Modules screen (/admin/collections/kit-modules):
 * install state, catalog, license entitlements and in-flight module ops. The
 * list's cells, the status banner, the install drawer and the module page's
 * sidebar panel all read from this one store, so a page load makes one set of
 * requests no matter how many rows render. Every mutation dispatches the
 * module-ops workflow through the admin-gated /api/modules/* routes and lands
 * as a PR (docs/MODULES.md → Admin panel + automatic updates).
 *
 * Non-admin staff get 403 from those routes: `registry` stays null and every
 * action UI renders nothing — the native list still works for them.
 */

export interface InstalledModule {
  slug: string;
  name: string;
  version: string;
  system: boolean;
}

export interface RegistryResponse {
  installed: InstalledModule[];
  lock: {
    modules: Record<
      string,
      { version: string; source: unknown; pinned?: boolean }
    >;
  };
  /** GitHub connected through Meet Dream AI (/admin → Updates)? */
  githubConnected: boolean;
  /** Paid modules install through a PR, so they need GitHub connected. */
  paidModulesEnabled: boolean;
  catalogUrl: string | null;
  /** Has this site got its license key from meetdream.com yet? */
  licenseConfigured: boolean;
}

export interface CatalogEntry {
  slug: string;
  name: string;
  description?: string;
  /** Free modules install from a repo; paid ones from the Dream registry. */
  repo?: string;
  latest?: string;
  kitCompat?: string;
  paid?: boolean;
  /** Dream registry catalog (schema 2) says "paid" | "free". */
  access?: "paid" | "free";
  /** "Included in <plan>" on paid cards (older registries: plans joined). */
  plan?: string;
  /** The plans that include a paid module, one name each. */
  plans?: string[];
  /** Where to buy access when not entitled. */
  pricingUrl?: string;
}

interface EntitlementsState {
  configured: boolean;
  status: "none" | "active" | "inactive" | "error" | "disabled";
  code?: string;
  entitlements: { slug: string; plan?: string }[];
}

export interface OpsResponse {
  runs: {
    id: number;
    status: string;
    conclusion: string | null;
    url: string;
    title: string;
  }[];
  prs: {
    number: number;
    title: string;
    url: string;
    kind: "module" | "kit";
    conflicts: boolean;
    needsReview: boolean;
    approved: boolean;
  }[];
}

interface State {
  loaded: boolean;
  registry: RegistryResponse | null;
  catalog: CatalogEntry[];
  entitlements: EntitlementsState | null;
  ops: OpsResponse | null;
  busy: boolean;
}

export type ModuleOp =
  | { op: "add"; source: string }
  | { op: "update"; slug: string }
  | { op: "remove"; slug: string }
  | { op: "kit-update" }
  | { op: "check" }
  | { op: "merge" };

/* ── helpers (pure) ──────────────────────────────────────────────────────── */

/** Paid modules come from the Dream registry, free ones from a public repo. */
export const isPaidEntry = (entry: CatalogEntry): boolean =>
  entry.paid ?? (entry.access ? entry.access === "paid" : !entry.repo);

/** Tiny semver-ish "is b newer than a" for update badges (no prereleases). */
export const isNewer = (a: string, b: string): boolean => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const [x = 0, y = 0] = [pa[i], pb[i]];
    if (x !== y) return y > x;
  }
  return false;
};

/** The lock's `source` field ("local", "github", "registry", or an object). */
export const sourceOf = (source: unknown): string => {
  if (typeof source === "string") return source;
  if (source && typeof source === "object" && "type" in source) {
    return String((source as { type: string }).type);
  }
  return "unknown";
};

const SOURCE_LABELS: Record<string, string> = {
  local: "Bundled",
  github: "GitHub",
  registry: "Dream registry",
  zip: "ZIP upload",
};

export const sourceLabel = (source: string): string =>
  SOURCE_LABELS[source] ?? source.charAt(0).toUpperCase() + source.slice(1);

/* ── store ───────────────────────────────────────────────────────────────── */

let state: State = {
  loaded: false,
  registry: null,
  catalog: [],
  entitlements: null,
  ops: null,
  busy: false,
};
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const setState = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getJson = async <T>(url: string): Promise<T | null> => {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
};

async function load(): Promise<void> {
  const registry = await getJson<RegistryResponse>("/api/modules/registry");
  if (!registry) {
    setState({ loaded: true, registry: null });
    return;
  }
  const [catalog, entitlements, ops] = await Promise.all([
    registry.catalogUrl
      ? getJson<{ modules?: CatalogEntry[] }>(registry.catalogUrl).then(
          (c) => c?.modules ?? [],
        )
      : Promise.resolve([]),
    // License/entitlement state for paid modules — proxied server-side so the
    // key never reaches the browser.
    getJson<EntitlementsState>("/api/modules/entitlements"),
    registry.githubConnected
      ? getJson<OpsResponse>("/api/modules/ops")
      : Promise.resolve(null),
  ]);
  setState({ loaded: true, registry, catalog, entitlements, ops });
}

/** Load once per page; `force` re-fetches (after a dispatch). */
export function refreshModulesAdmin(force = false): Promise<void> {
  if (!force && (state.loaded || inflight))
    return inflight ?? Promise.resolve();
  inflight = load().finally(() => {
    inflight = null;
  });
  return inflight;
}

const DISPATCHED: Record<ModuleOp["op"], string> = {
  add: "Install requested — a pull request opens shortly and merges itself once its checks pass.",
  update:
    "Update requested — a pull request opens shortly and merges itself once its checks pass.",
  remove:
    "Removal requested — a pull request will open shortly. It never merges on its own.",
  "kit-update":
    "Checking for a Dream Starter Kit update — if there is one, a pull request opens shortly.",
  check: "Checking for updates — pull requests open shortly for anything new.",
  merge: "Merging the updates that are ready.",
};

/** Dispatch a module op (module-ops.yml → PR). Resolves true on success. */
export async function dispatchModuleOp(body: ModuleOp): Promise<boolean> {
  setState({ busy: true });
  try {
    const res = await fetch("/api/modules/ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(json.error ?? `Request failed (HTTP ${res.status}).`);
      return false;
    }
    toast.success(DISPATCHED[body.op]);
    await refreshModulesAdmin(true);
    return true;
  } catch {
    toast.error("Request failed. Check your connection and try again.");
    return false;
  } finally {
    setState({ busy: false });
  }
}

/** Upload a module ZIP (signed URL + sha256), then dispatch its install. */
/* ── hook ────────────────────────────────────────────────────────────────── */

export interface ModuleRowStatus {
  /** Lock source key ("local", "github", "registry", …). */
  source: string;
  pinned: boolean;
  /** Newer installable version, when there is one. */
  updateTo: string | null;
  /** Can an update be dispatched for this module right now? */
  canUpdate: boolean;
  /** Can a removal be dispatched for this module right now? */
  canRemove: boolean;
  /** License line for Dream registry modules (null for other sources). */
  license: { label: string; ok: boolean } | null;
}

export function useModulesAdmin() {
  const snap = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
  useEffect(() => {
    void refreshModulesAdmin();
  }, []);

  const { registry, catalog, entitlements } = snap;
  const licenseActive = entitlements?.status === "active";
  const entitledPlans = new Map(
    (entitlements?.entitlements ?? []).map((e) => [e.slug, e.plan]),
  );
  const isEntitled = (slug: string) => licenseActive && entitledPlans.has(slug);
  const catalogBySlug = new Map(catalog.map((e) => [e.slug, e]));
  // GitHub not connected → no paid modules: only free catalog entries show.
  const visibleCatalog = registry?.paidModulesEnabled
    ? catalog
    : catalog.filter((e) => !isPaidEntry(e));
  const installedSlugs = new Set(registry?.installed.map((i) => i.slug) ?? []);

  const licenseFor = (slug: string): { label: string; ok: boolean } => {
    if (!registry?.paidModulesEnabled)
      return { label: "Connect GitHub to update paid modules", ok: false };
    if (!registry.licenseConfigured)
      return { label: "No license key — updates paused", ok: false };
    if (entitlements?.status === "error")
      return { label: "License status unavailable", ok: false };
    if (!isEntitled(slug))
      return { label: "License inactive — updates paused", ok: false };
    return { label: "License active", ok: true };
  };

  const statusFor = (slug: string): ModuleRowStatus | null => {
    if (!registry) return null;
    const mod = registry.installed.find((m) => m.slug === slug);
    const entry = registry.lock.modules[slug];
    const source = sourceOf(entry?.source);
    const fromRegistry = source === "registry";
    const latest = catalogBySlug.get(slug)?.latest;
    const updatable = source === "github" || (fromRegistry && isEntitled(slug));
    const updateTo =
      mod && latest && updatable && isNewer(mod.version, latest)
        ? latest
        : null;
    return {
      source,
      pinned: Boolean(entry?.pinned),
      updateTo,
      canUpdate: registry.githubConnected && updatable,
      canRemove: registry.githubConnected && Boolean(mod) && !mod?.system,
      license: fromRegistry ? licenseFor(slug) : null,
    };
  };

  return {
    ...snap,
    visibleCatalog,
    installedSlugs,
    isEntitled,
    statusFor,
  };
}

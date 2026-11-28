"use client";

import { useEffect, useSyncExternalStore } from "react";
import { toast } from "@payloadcms/ui";

import type { InstallState } from "~/lib/mod/install-state";
import {
  installStateFor,
  isBusy,
  PENDING_TTL_MS,
} from "~/lib/mod/install-state";

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
  /** Modules the latest release requires (installed with it if missing). */
  requires?: string[];
}

interface EntitlementsState {
  configured: boolean;
  status: "none" | "active" | "inactive" | "error" | "disabled";
  code?: string;
  entitlements: { slug: string; plan?: string }[];
}

interface OpsPrView {
  number: number;
  title: string;
  url: string;
  kind: "module" | "kit";
  conflicts: boolean;
  needsReview: boolean;
  approved: boolean;
  /** From the PR marker: the module, its version and what it brings along. */
  slug: string | null;
  to: string | null;
  also: string[];
}

export interface OpsResponse {
  runs: {
    id: number;
    status: string;
    conclusion: string | null;
    url: string;
    title: string;
    createdAt: string;
    /** From the run-name: the op and the modules it names. */
    target: { op: string; slugs: string[] } | null;
  }[];
  prs: OpsPrView[];
  /** Module PRs merged in the last two hours (deploys may be running). */
  merged?: OpsPrView[];
}

interface State {
  /** Everything (registry, catalog, entitlements, ops) has arrived. */
  loaded: boolean;
  /** `/api/modules/registry` has answered (`registry` is final). */
  registryLoaded: boolean;
  registry: RegistryResponse | null;
  catalog: CatalogEntry[];
  entitlements: EntitlementsState | null;
  ops: OpsResponse | null;
  /** An update/remove/merge request is on its way (installs don't block). */
  busy: boolean;
  /** Installs this browser asked for: slug → when (ms). */
  pending: Map<string, number>;
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

// Installs asked for in this tab survive a reload until GitHub shows them.
const PENDING_KEY = "dream:module-installs";

function readPending(): Map<string, number> {
  try {
    if (typeof window === "undefined") return new Map();
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    const entries = raw ? (JSON.parse(raw) as [string, number][]) : [];
    const now = Date.now();
    return new Map(entries.filter(([, at]) => now - at < PENDING_TTL_MS));
  } catch {
    return new Map();
  }
}

function writePending(pending: Map<string, number>): void {
  try {
    window.sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify([...pending.entries()]),
    );
  } catch {
    // Private window: pending installs last for this page only.
  }
}

let state: State = {
  loaded: false,
  registryLoaded: false,
  registry: null,
  catalog: [],
  entitlements: null,
  ops: null,
  busy: false,
  pending: readPending(),
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
  // Entitlements don't depend on the registry: start them now. Then publish
  // the registry the moment it answers, so the list's cells and banners don't
  // wait on the slower catalog (meetdream.com) and GitHub ops requests.
  // License/entitlement state for paid modules — proxied server-side so the
  // key never reaches the browser.
  const entitlementsReq = getJson<EntitlementsState>(
    "/api/modules/entitlements",
  );
  const registry = await getJson<RegistryResponse>("/api/modules/registry");
  if (!registry) {
    setState({ loaded: true, registryLoaded: true, registry: null });
    return;
  }
  setState({ registryLoaded: true, registry });
  const [catalog, entitlements, ops] = await Promise.all([
    registry.catalogUrl
      ? getJson<{ modules?: CatalogEntry[] }>(registry.catalogUrl).then(
          (c) => c?.modules ?? [],
        )
      : Promise.resolve([]),
    entitlementsReq,
    registry.githubConnected
      ? getJson<OpsResponse>("/api/modules/ops")
      : Promise.resolve(null),
  ]);
  setState({ loaded: true, catalog, entitlements, ops });
  if (anyInFlight()) startPolling();
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

/* ── installs (App Store–style: Install → ring → Installed) ─────────────── */

/** Clicks this close together become one run and one pull request. */
const BATCH_MS = 2_500;
let batch: string[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

function setPending(update: (pending: Map<string, number>) => void): void {
  const next = new Map(state.pending);
  update(next);
  writePending(next);
  setState({ pending: next });
}

/**
 * Start installing `slug` (and the modules it requires that aren't
 * installed, which install with it). The button turns into a ring at once;
 * the request goes out with any other clicks from the next few seconds.
 */
export function requestInstall(slug: string, alsoInstalls: string[] = []) {
  const now = Date.now();
  setPending((p) => {
    for (const s of [slug, ...alsoInstalls]) p.set(s, now);
  });
  if (!batch.includes(slug)) batch.push(slug);
  if (batchTimer) clearTimeout(batchTimer);
  batchTimer = setTimeout(() => void flushInstalls(), BATCH_MS);
  startPolling();
}

async function flushInstalls(): Promise<void> {
  batchTimer = null;
  const slugs = batch;
  batch = [];
  if (slugs.length === 0) return;
  try {
    const res = await fetch("/api/modules/ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "add",
        sources: slugs.map((s) => `dream:${s}`),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      inFlight?: string[];
    };
    if (res.status === 409) {
      // Already on its way (another tab, another admin): show its progress.
      toast.info(json.error ?? "Already being installed.");
    } else if (!res.ok) {
      toast.error(
        json.error ?? `Install failed to start (HTTP ${res.status}).`,
      );
      dropPending(slugs);
      return;
    }
  } catch {
    toast.error(
      "Install failed to start. Check your connection and try again.",
    );
    dropPending(slugs);
    return;
  }
  await refreshOps();
}

function dropPending(slugs: string[]): void {
  setPending((p) => {
    for (const s of slugs) p.delete(s);
  });
}

async function refreshOps(): Promise<void> {
  if (!state.registry?.githubConnected) return;
  const ops = await getJson<OpsResponse>("/api/modules/ops");
  if (ops) setState({ ops });
}

// Poll GitHub while an install is in flight and the tab is visible; stop
// when nothing is.
const POLL_MS = 10_000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function anyInFlight(): boolean {
  const slugs = new Set([
    ...state.pending.keys(),
    ...(state.ops?.prs ?? []).flatMap((p) =>
      p.kind === "module" ? [p.slug ?? "", ...p.also] : [],
    ),
    ...(state.ops?.merged ?? []).flatMap((p) => [p.slug ?? "", ...p.also]),
    ...(state.ops?.runs ?? []).flatMap((r) =>
      r.status !== "completed" ? (r.target?.slugs ?? []) : [],
    ),
  ]);
  slugs.delete("");
  return [...slugs].some((s) => isBusy(moduleInstallState(s)));
}

function startPolling(): void {
  if (pollTimer || typeof window === "undefined") return;
  pollTimer = setInterval(() => {
    if (!anyInFlight()) {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      return;
    }
    if (document.visibilityState !== "visible") return;
    void refreshOps().then(() => {
      // Deploying installs finish when the app redeploys with them: the
      // registry route reports the new build's modules.
      const deploying = (state.ops?.merged ?? []).some(
        (p) =>
          p.slug && !state.registry?.installed.some((m) => m.slug === p.slug),
      );
      if (deploying) void refreshRegistry();
    });
  }, POLL_MS);
}

async function refreshRegistry(): Promise<void> {
  const registry = await getJson<RegistryResponse>("/api/modules/registry");
  if (registry) setState({ registry });
}

/** Where `slug`'s install is (see lib/mod/install-state.ts). */
export function moduleInstallState(slug: string): InstallState {
  const toPr = (p: OpsPrView) => ({
    url: p.url,
    slug: p.slug,
    also: p.also,
    conflicts: p.conflicts,
    needsReview: p.needsReview,
  });
  const result = installStateFor(slug, {
    installed: new Set(state.registry?.installed.map((m) => m.slug) ?? []),
    openPrs: (state.ops?.prs ?? [])
      .filter((p) => p.kind === "module")
      .map(toPr),
    mergedPrs: (state.ops?.merged ?? []).map(toPr),
    runs: (state.ops?.runs ?? []).map((r) => ({
      status: r.status,
      conclusion: r.conclusion,
      url: r.url,
      createdAt: r.createdAt,
      target: r.target,
    })),
    pending: state.pending,
    now: Date.now(),
  });
  // GitHub has caught up (or it's done): the optimistic click can go.
  if (result.stage !== "requested" && state.pending.has(slug)) {
    queueMicrotask(() => {
      if (state.pending.has(slug)) dropPending([slug]);
    });
  }
  return result;
}

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

  /** Display names from the catalog (requires lists slugs). */
  const nameOf = (slug: string) => catalogBySlug.get(slug)?.name ?? slug;

  return {
    ...snap,
    visibleCatalog,
    installedSlugs,
    isEntitled,
    statusFor,
    installState: moduleInstallState,
    nameOf,
  };
}

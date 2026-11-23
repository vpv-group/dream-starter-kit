"use client";

import { useSyncExternalStore } from "react";

/**
 * Shared client state for the Modules page (`/admin/collections/kit-modules`).
 *
 * The page is Payload's own list view plus pieces rendered in its slots and
 * table cells (KitModulesPanels.tsx, KitModulesCells.tsx). They all read the
 * same registry/catalog/license/ops data and share one busy flag and status
 * message, so the state lives here, in a tiny external store, rather than in
 * a React context (Payload renders the slots and cells separately).
 *
 * Every mutation dispatches module-ops.yml and lands as a PR; without
 * GITHUB_OPS_TOKEN the page is read-only (docs/MODULES.md).
 */

export interface RegistryResponse {
  installed: { slug: string; name: string; version: string; system: boolean }[];
  lock: {
    modules: Record<
      string,
      { version: string; source: unknown; pinned?: boolean }
    >;
  };
  opsConfigured: boolean;
  /** Paid modules need module ops (GITHUB_OPS_TOKEN); off until then. */
  paidModulesEnabled: boolean;
  catalogUrl: string | null;
  /** Is DREAM_LICENSE_KEY set (paid modules — docs/MODULES.md)? */
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
  /** "Included in <plan>" on paid cards. */
  plan?: string;
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
  prs: { number: number; title: string; url: string }[];
}

export interface ModulesState {
  registry: RegistryResponse | null;
  catalog: CatalogEntry[];
  entitlements: EntitlementsState | null;
  ops: OpsResponse | null;
  busy: boolean;
  message: { kind: "success" | "error"; text: string } | null;
}

const initialState: ModulesState = {
  registry: null,
  catalog: [],
  entitlements: null,
  ops: null,
  busy: false,
  message: null,
};

let state = initialState;
const listeners = new Set<() => void>();

function update(patch: Partial<ModulesState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useModulesState(): ModulesState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => initialState,
  );
}

/** Reload the registry, catalog, license state and operations. */
export async function refreshModules(): Promise<void> {
  const registry = (await fetch("/api/modules/registry").then((r) =>
    r.ok ? r.json() : null,
  )) as RegistryResponse | null;
  let catalog: CatalogEntry[] = [];
  if (registry?.catalogUrl) {
    try {
      const cat = (await fetch(registry.catalogUrl).then((r) => r.json())) as {
        modules?: CatalogEntry[];
      };
      catalog = cat.modules ?? [];
    } catch {
      catalog = [];
    }
  }
  // License/entitlement state for paid modules — proxied server-side so the
  // key never reaches the browser.
  const entitlements = (await fetch("/api/modules/entitlements").then((r) =>
    r.ok ? r.json() : null,
  )) as EntitlementsState | null;
  const ops = registry?.opsConfigured
    ? ((await fetch("/api/modules/ops").then((r) =>
        r.ok ? r.json() : null,
      )) as OpsResponse | null)
    : null;
  update({ registry, catalog, entitlements, ops });
}

/** Dispatch a module-ops run (add / update / remove). */
export async function dispatchModuleOp(
  body: Record<string, unknown>,
): Promise<boolean> {
  update({ busy: true, message: null });
  try {
    const res = await fetch("/api/modules/ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as { error?: string };
    update({
      message: res.ok
        ? {
            kind: "success",
            text: "Dispatched — a PR will open shortly (see Operations). Merging it deploys; migrations apply automatically when the new version deploys.",
          }
        : { kind: "error", text: json.error ?? "Dispatch failed" },
    });
    await refreshModules();
    return res.ok;
  } finally {
    update({ busy: false });
  }
}

/** Upload a module zip, then dispatch its install. */
export async function uploadModuleZip(file: File): Promise<boolean> {
  update({ busy: true, message: null });
  try {
    const form = new FormData();
    form.set("file", file);
    const res = await fetch("/api/modules/upload", {
      method: "POST",
      body: form,
    });
    const json = (await res.json()) as {
      url?: string;
      sha256?: string;
      error?: string;
    };
    if (!res.ok || !json.url || !json.sha256) {
      update({
        message: { kind: "error", text: json.error ?? "Upload failed" },
      });
      return false;
    }
    return await dispatchModuleOp({
      op: "add",
      source: json.url,
      sha256: json.sha256,
    });
  } finally {
    update({ busy: false });
  }
}

/** Paid modules come from the Dream registry, free ones from a public repo. */
export const isPaidEntry = (entry: CatalogEntry): boolean =>
  entry.paid ?? (entry.access ? entry.access === "paid" : !entry.repo);

/** Tiny semver-ish "is b newer than a" for update badges (no prereleases). */
const isNewer = (a: string, b: string): boolean => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const [x = 0, y = 0] = [pa[i], pb[i]];
    if (x !== y) return y > x;
  }
  return false;
};

const sourceLabel = (source: unknown): string => {
  if (typeof source === "string") return source;
  if (source && typeof source === "object" && "type" in source) {
    return String((source as { type: string }).type);
  }
  return "unknown";
};

/**
 * Per-module facts derived from the state: origin, pinned, license label,
 * whether an update is available and which actions apply.
 */
export function describeModule(s: ModulesState, slug: string, version: string) {
  const registry = s.registry;
  const entry = registry?.lock.modules[slug];
  const origin = sourceLabel(entry?.source);
  const fromRegistry = origin === "registry";
  const entitled = isEntitled(s, slug);
  const catalogLatest = s.catalog.find((e) => e.slug === slug)?.latest;
  const updateAvailable =
    fromRegistry && entitled && catalogLatest && isNewer(version, catalogLatest)
      ? catalogLatest
      : null;
  const system =
    registry?.installed.find((mod) => mod.slug === slug)?.system ?? false;
  return {
    origin,
    fromRegistry,
    pinned: entry?.pinned ?? false,
    system,
    updateAvailable,
    upToDate: fromRegistry && entitled && !updateAvailable,
    licenseLabel: fromRegistry ? licenseLabel(s, slug) : null,
    canUpdate:
      !!registry?.opsConfigured &&
      (origin === "github" || (fromRegistry && entitled)),
    canRemove: !!registry?.opsConfigured && !system,
  };
}

/** Paid-module entitlement (docs/MODULES.md → Paid modules). */
export function isEntitled(s: ModulesState, slug: string): boolean {
  return (
    s.entitlements?.status === "active" &&
    s.entitlements.entitlements.some((e) => e.slug === slug)
  );
}

function licenseLabel(s: ModulesState, slug: string): string {
  if (!s.registry?.paidModulesEnabled)
    return "Paid modules off — set up module ops (top of /admin)";
  if (!s.registry.licenseConfigured) return "No license key — updates paused";
  if (s.entitlements?.status === "error") return "License status unavailable";
  if (!isEntitled(s, slug)) return "License inactive — updates paused";
  return "License active";
}

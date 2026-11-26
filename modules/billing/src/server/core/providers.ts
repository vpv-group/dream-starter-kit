import { getModAdapters } from "@acme/mod-kit/server";

import type { BillingProvider } from "./types";

/**
 * The installed payment providers (adapter modules with
 * `adapter.for: "billing"`), in slug order. Loaded lazily by mod-kit from the
 * generated registries — billing never imports its adapters.
 */
export async function getBillingProviders(): Promise<BillingProvider[]> {
  const entries = await getModAdapters<BillingProvider>("billing");
  return entries.map((e) => e.adapter);
}

/** A provider by id, if installed. */
export async function getBillingProvider(
  id: string,
): Promise<BillingProvider | null> {
  return (await getBillingProviders()).find((p) => p.id === id) ?? null;
}

/**
 * The provider that takes WEB payments: the requested one when given, else
 * the first configured provider that sells on the web. Null when none is
 * installed and configured (checkout then answers 503).
 */
export async function resolveWebProvider(
  requested?: string | null,
): Promise<BillingProvider | null> {
  const all = await getBillingProviders();
  const candidates = requested
    ? all.filter((p) => p.id === requested)
    : all.filter((p) => p.platforms.includes("web"));
  for (const p of candidates) {
    try {
      if (await p.isConfigured()) return p;
    } catch (err) {
      console.warn(`[billing] ${p.id}.isConfigured failed`, err);
    }
  }
  return null;
}

import "server-only";

import { z } from "zod/v4";

import { env } from "~/env";

/**
 * Dream module registry (paid modules — docs/MODULES.md → Paid modules).
 * Server-side helpers for the /api/modules/* admin routes: the license key
 * never reaches the browser; the admin UI talks to our staff-gated proxy
 * routes instead.
 */

/** Registry base URL (validated + defaulted by the zod env schema). */
export function dreamRegistryUrl(): string {
  return env.DREAM_REGISTRY_URL.replace(/\/$/, "");
}

/**
 * The catalog the /admin/modules store reads. A self-hoster who sets
 * MOD_CATALOG_URL keeps it; otherwise it defaults to the Dream registry's
 * schema-2 catalog (which includes paid modules).
 */
export function catalogUrl(): string {
  return env.MOD_CATALOG_URL ?? `${dreamRegistryUrl()}/catalog?schema=2`;
}

/**
 * The catalog for the admin store, or null: the Dream catalog lists paid
 * modules, so it's only offered once paid modules are enabled. A self-hoster's
 * MOD_CATALOG_URL is always kept.
 */
export function catalogUrlFor(paidEnabled: boolean): string | null {
  if (env.MOD_CATALOG_URL) return env.MOD_CATALOG_URL;
  return paidEnabled ? catalogUrl() : null;
}

export function licenseConfigured(): boolean {
  return Boolean(env.DREAM_LICENSE_KEY);
}

const entitlementItem = z.union([
  z.string(),
  z.object({
    slug: z.string(),
    plan: z.string().optional(),
    /** The registry lists every module with this flag; false = not owned. */
    entitled: z.boolean().optional(),
  }),
]);
const entitlementsSchema = z.object({
  entitlements: z.array(entitlementItem).optional(),
  modules: z.array(entitlementItem).optional(),
});
const errorBodySchema = z.object({
  error: z.string().optional(),
  code: z.string().optional(),
});

export interface EntitlementsState {
  /** Is DREAM_LICENSE_KEY set at all? */
  configured: boolean;
  /**
   * none = no key; active = the key unlocks `entitlements`; inactive = the
   * registry rejected the key (`code` says why — revoked_key, not_entitled,
   * invalid_key); error = the registry was unreachable; disabled = paid
   * modules are off until module ops is configured.
   */
  status: "none" | "active" | "inactive" | "error" | "disabled";
  code?: string;
  entitlements: { slug: string; plan?: string }[];
}

/**
 * `GET {registry}/entitlements` with the server-held license key — the key
 * never reaches the browser; /api/modules/entitlements proxies this state to
 * the staff-only admin UI. Never throws: problems become calm states.
 */
export async function fetchEntitlements(): Promise<EntitlementsState> {
  const key = env.DREAM_LICENSE_KEY;
  if (!key) return { configured: false, status: "none", entitlements: [] };
  try {
    const res = await fetch(`${dreamRegistryUrl()}/entitlements`, {
      headers: { "X-Dream-License-Key": key },
      cache: "no-store",
    });
    const body: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const parsed = errorBodySchema.safeParse(body);
      const code = parsed.success
        ? (parsed.data.error ?? parsed.data.code)
        : undefined;
      return {
        configured: true,
        status: "inactive",
        ...(code ? { code } : {}),
        entitlements: [],
      };
    }
    const parsed = entitlementsSchema.safeParse(body);
    const items = parsed.success
      ? (parsed.data.entitlements ?? parsed.data.modules ?? [])
      : [];
    return {
      configured: true,
      status: "active",
      entitlements: items
        .filter((item) => typeof item === "string" || item.entitled !== false)
        .map((item) =>
          typeof item === "string"
            ? { slug: item }
            : { slug: item.slug, ...(item.plan ? { plan: item.plan } : {}) },
        ),
    };
  } catch {
    return { configured: true, status: "error", entitlements: [] };
  }
}

import "server-only";

import { hasModule } from "~/mod/registry.data.generated";

/**
 * Runtime enable/disable gate (docs/MODULES-PLAN.md §2.5). A module is
 * enabled when it's installed (in the generated registry) and its
 * `kit-modules` row hasn't been toggled off in /admin.
 *
 * The disabled set is read via the Local API with a short in-memory cache
 * (per serverless instance) so the API dispatcher and generated stub layouts
 * don't pay a CMS read per request. Rows are created enabled by the boot
 * reconcile; a missing row or an unreachable CMS therefore reads as ENABLED —
 * degrading open matches every other CMS reader in the kit (lib/payload.ts).
 */
const CACHE_MS = 30_000;

let cached: { at: number; disabled: Set<string> } | null = null;

async function disabledModules(): Promise<Set<string>> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.disabled;
  try {
    const { getPayloadClient } = await import("../cms/payload-client");
    const payload = await getPayloadClient();
    const res = await payload.find({
      collection: "kit-modules",
      where: { enabled: { equals: false } },
      pagination: false,
      overrideAccess: true,
    });
    cached = {
      at: now,
      disabled: new Set(res.docs.flatMap((d) => (d.slug ? [d.slug] : []))),
    };
  } catch {
    cached = { at: now, disabled: new Set() };
  }
  return cached.disabled;
}

export async function isModuleEnabled(slug: string): Promise<boolean> {
  if (!hasModule(slug)) return false;
  return !(await disabledModules()).has(slug);
}

/** The runtime-disabled module slugs (for widget/menu filtering). */
export async function disabledModuleSlugs(): Promise<string[]> {
  return [...(await disabledModules())];
}

/** Test seam: drop the in-memory cache. */
export function resetEnabledCache(): void {
  cached = null;
}

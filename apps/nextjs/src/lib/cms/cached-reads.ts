import "server-only";

import { unstable_cache } from "next/cache";

import { env } from "../../env";

/**
 * Cross-request cache for the CMS reads every page render needs (theme,
 * auth settings, site settings, menus). Payload's website-template pattern:
 * Next's tagged data cache, invalidated from the collection/global's own
 * `afterChange` hook (payload/hooks/revalidate-cache.ts), so an edit in /admin
 * shows on the next request without a redeploy — and an unchanged menu costs
 * zero database queries.
 *
 * Only GLOBAL, non-user data goes through here. Per-user filtering (staff-only
 * items, module access checks) happens after the cached read, never inside it.
 * The hourly `revalidate` is a safety net in case an invalidation was missed.
 *
 * Production only. Next keeps this cache on disk (`.next/cache`), so under
 * `next dev` it would outlive a `pnpm db:reset` and serve the previous
 * database's settings (the E2E suite resets the DB before every run). Dev
 * and tests read fresh.
 */
export const cacheTags = {
  global: (slug: string) => `global_${slug}`,
  collection: (slug: string) => `collection_${slug}`,
} as const;

const SAFETY_REVALIDATE_SECONDS = 3600;

const useSharedCache = env.NODE_ENV === "production";

/**
 * Vercel keeps the data cache across deployments, while a deploy can change
 * menus and settings through the boot-time reconcile, which runs outside a
 * request where revalidateTag can't. Keying by deployment starts each one
 * fresh.
 */
const deployment = env.VERCEL_DEPLOYMENT_ID ?? "local";

/** `unstable_cache` in production; a plain call everywhere else. */
function cached<T>(
  fn: () => Promise<T>,
  key: string[],
  tags: string[],
): () => Promise<T> {
  return useSharedCache
    ? unstable_cache(fn, key, { tags, revalidate: SAFETY_REVALIDATE_SECONDS })
    : fn;
}

async function payloadClient() {
  const { getPayloadClient } = await import("./payload-client");
  return getPayloadClient();
}

/** A Payload global's published version, cached until it changes. */
export function readCachedGlobal<T>(
  slug:
    | "theme-settings"
    | "authentication-settings"
    | "site-settings"
    | "native-navigation",
  depth: number,
): Promise<T> {
  return cached(
    async () => {
      const payload = await payloadClient();
      return (await payload.findGlobal({
        slug,
        depth,
        draft: false,
        overrideAccess: true,
      })) as T;
    },
    ["cms-global", deployment, slug, String(depth)],
    [cacheTags.global(slug)],
  )();
}

/**
 * The menu source rows — every nav item (CMS drag order) and every installed
 * module — shared by the web sidebar, the phone/tablet tab bar and
 * GET /api/nav/native. One cached read instead of two queries per render.
 */
export const readNavSource = cached(
  async () => {
    const payload = await payloadClient();
    const [navRes, modRes] = await Promise.all([
      payload.find({
        collection: "nav-items",
        sort: "_order",
        pagination: false,
        depth: 1,
        overrideAccess: true,
      }),
      payload.find({
        collection: "kit-modules",
        pagination: false,
        depth: 0,
        overrideAccess: true,
      }),
    ]);
    return { navItems: navRes.docs, modules: modRes.docs };
  },
  ["cms-nav-source", deployment],
  [cacheTags.collection("nav-items"), cacheTags.collection("kit-modules")],
);

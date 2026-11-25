import "server-only";

import { unstable_cache } from "next/cache";

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
 */
export const cacheTags = {
  global: (slug: string) => `global_${slug}`,
  collection: (slug: string) => `collection_${slug}`,
} as const;

const SAFETY_REVALIDATE_SECONDS = 3600;

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
  return unstable_cache(
    async () => {
      const payload = await payloadClient();
      return (await payload.findGlobal({
        slug,
        depth,
        draft: false,
        overrideAccess: true,
      })) as T;
    },
    ["cms-global", slug, String(depth)],
    {
      tags: [cacheTags.global(slug)],
      revalidate: SAFETY_REVALIDATE_SECONDS,
    },
  )();
}

/**
 * The menu source rows — every nav item (CMS drag order) and every installed
 * module — shared by the web sidebar, the phone/tablet tab bar and
 * GET /api/nav/native. One cached read instead of two queries per render.
 */
export const readNavSource = unstable_cache(
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
  ["cms-nav-source"],
  {
    tags: [
      cacheTags.collection("nav-items"),
      cacheTags.collection("kit-modules"),
    ],
    revalidate: SAFETY_REVALIDATE_SECONDS,
  },
);

import type { Payload } from "payload";

/** The tab count a fresh install publishes (the editor's default too). */
export const SEED_NATIVE_TAB_COUNT = "4";

/**
 * First-seed step: publish the `native-navigation` global (/admin →
 * Navigation → "iOS and Android App") with a 4-tab bar and every native
 * menu row in its default order, all visible. Without it the global has no
 * published version until staff first press Publish.
 *
 * Runs after the nav reconcile (which creates the `nav-items` rows in
 * default order). Never overwrites staff work: if the global was ever saved
 * (draft or published), it's left alone.
 */
export async function seedNativeNavigation(payload: Payload): Promise<void> {
  const current = await payload.findGlobal({
    slug: "native-navigation",
    depth: 0,
    draft: true,
    overrideAccess: true,
  });
  if (current.updatedAt) return;

  const nav = await payload.find({
    collection: "nav-items",
    where: { platforms: { in: ["native"] } },
    sort: "_order",
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });

  await payload.updateGlobal({
    slug: "native-navigation",
    data: {
      tabCount: SEED_NATIVE_TAB_COUNT,
      items: nav.docs.map((d) => ({ item: d.id, hidden: false })),
      _status: "published",
    },
    overrideAccess: true,
  });
}

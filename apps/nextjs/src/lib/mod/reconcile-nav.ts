import type { Payload } from "payload";

import { modInstalled, modNavDefaults } from "~/mod/registry.data.generated";
import { modSettings } from "~/mod/registry.payload.generated";
import { CORE_NAV_ITEMS } from "./core-nav";

/**
 * Boot-time reconcile of the CMS-driven menu + module registry
 * (docs/MODULES-PLAN.md §2.5). Diffs the GENERATED defaults (core nav +
 * manifest nav, baked into the registries at sync time) against the
 * `kit-modules` and `nav-items` collections:
 *
 *   - inserts rows for newly installed modules (enabled, manifest defaults),
 *   - updates framework-owned read-only fields (name/version/system, href),
 *   - deletes rows whose module (or core entry) was removed,
 *   - NEVER overwrites staff edits — label/icon/platforms/enabled/order are
 *     written only on row creation.
 *
 * Invoked from instrumentation.ts after the Payload warm-up (so "merge the
 * install PR → deploy → menu row exists" needs zero manual steps) and as a CMS
 * seed step for local `pnpm db:reset`. Idempotent; safe under concurrent cold
 * starts (unique keys make duplicate creates fail quietly).
 */

interface DesiredNavItem {
  key: string;
  label: string;
  href: string;
  icon?: string;
  order: number;
  platforms: ("web" | "native")[];
  /** Module slug — undefined for core entries. */
  module?: string;
  /** Default audience (manifest nav `audience`); staff own it afterwards. */
  audience: "everyone" | "staff";
}

/** Merge a module's web + native nav defaults into per-href menu rows. */
export function desiredNavItems(): DesiredNavItem[] {
  const items: DesiredNavItem[] = CORE_NAV_ITEMS.map((c) => ({
    audience: "everyone" as const,
    ...c,
  }));

  const byKey = new Map<string, DesiredNavItem>();
  for (const [platform, entries] of [
    ["web", modNavDefaults.web],
    ["native", modNavDefaults.native],
  ] as const) {
    for (const entry of entries) {
      const key = `mod:${entry.module}:${entry.href}`;
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.platforms.includes(platform))
          existing.platforms.push(platform);
        continue;
      }
      const item: DesiredNavItem = {
        key,
        label: entry.title,
        href: entry.href,
        icon: entry.icon,
        order: entry.order,
        platforms: [platform],
        module: entry.module,
        audience: entry.audience ?? "everyone",
      };
      byKey.set(key, item);
      items.push(item);
    }
  }

  return items.sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
}

export async function reconcileModules(payload: Payload): Promise<void> {
  // --- kit-modules rows -------------------------------------------------
  const existingMods = await payload.find({
    collection: "kit-modules",
    pagination: false,
    overrideAccess: true,
  });
  const modRowBySlug = new Map(existingMods.docs.map((d) => [d.slug, d]));

  for (const mod of modInstalled) {
    const row = modRowBySlug.get(mod.slug);
    if (!row) {
      const created = await payload.create({
        collection: "kit-modules",
        data: {
          slug: mod.slug,
          name: mod.name,
          version: mod.version,
          system: mod.system,
          accessCheck: mod.accessCheck ?? null,
          enabled: true,
        },
        overrideAccess: true,
      });
      modRowBySlug.set(mod.slug, created);
    } else if (
      row.version !== mod.version ||
      row.name !== mod.name ||
      row.system !== mod.system ||
      (row.accessCheck ?? null) !== (mod.accessCheck ?? null)
    ) {
      // Framework-owned metadata only — `enabled` is staff-owned.
      const updated = await payload.update({
        collection: "kit-modules",
        id: row.id,
        data: {
          version: mod.version,
          name: mod.name,
          system: mod.system,
          accessCheck: mod.accessCheck ?? null,
        },
        overrideAccess: true,
        context: { skipModuleSettingsHooks: true },
      });
      modRowBySlug.set(mod.slug, updated);
    }
  }
  for (const row of existingMods.docs) {
    if (!modInstalled.some((e) => e.slug === row.slug)) {
      await payload.delete({
        collection: "kit-modules",
        id: row.id,
        overrideAccess: true,
      });
      modRowBySlug.delete(row.slug);
    }
  }

  // --- module settings: one-time copy off the legacy globals ------------
  // Before kit 2.2 each module's settings were a global
  // (`mod-<slug>-settings`); they now live on the module's kit-modules row.
  // Copy a saved global over once, then mark the row so it never re-copies.
  for (const settings of Object.values(modSettings)) {
    const row = modRowBySlug.get(settings.slug);
    if (!row || row.settingsCopied) continue;
    let values: Record<string, unknown> | null = null;
    try {
      const legacy = (await payload.findGlobal({
        slug: settings.globalSlug as never,
        depth: 0,
        overrideAccess: true,
      })) as Record<string, unknown>;
      // A never-saved global has no updatedAt — nothing worth copying.
      if (legacy.updatedAt) values = stripGlobalMeta(legacy);
    } catch {
      values = null;
    }
    const updated = await payload.update({
      collection: "kit-modules",
      id: row.id,
      data: {
        settingsCopied: true,
        ...(values ? { [settings.groupName]: values } : {}),
      },
      overrideAccess: true,
      context: { skipModuleSettingsHooks: true },
    });
    modRowBySlug.set(settings.slug, updated);
  }

  // --- nav-items rows ------------------------------------------------------
  const desired = desiredNavItems();
  const desiredByKey = new Map(desired.map((d) => [d.key, d]));
  const existingNav = await payload.find({
    collection: "nav-items",
    pagination: false,
    overrideAccess: true,
  });
  const navByKey = new Map(existingNav.docs.map((d) => [d.key, d]));

  for (const row of existingNav.docs) {
    if (!desiredByKey.has(row.key)) {
      await payload.delete({
        collection: "nav-items",
        id: row.id,
        overrideAccess: true,
      });
    }
  }

  // Create missing rows in menu order so Payload's drag-order (_order) starts
  // out matching the intended default order.
  for (const item of desired) {
    if (navByKey.has(item.key)) continue;
    const modRowId = item.module
      ? modRowBySlug.get(item.module)?.id
      : undefined;
    try {
      await payload.create({
        collection: "nav-items",
        data: {
          key: item.key,
          label: item.label,
          href: item.href,
          icon: item.icon,
          platforms: item.platforms,
          audience: item.audience,
          enabled: true,
          ...(modRowId !== undefined ? { module: modRowId } : {}),
        },
        overrideAccess: true,
      });
    } catch (err) {
      // Unique-key violation = a concurrent cold start created it first. Fine.
      payload.logger.debug(
        { err, key: item.key },
        "nav-items reconcile: create raced",
      );
    }
  }
}

/** A global document minus Payload's own bookkeeping keys. */
export function stripGlobalMeta(
  doc: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (["id", "globalType", "createdAt", "updatedAt", "_status"].includes(key))
      continue;
    out[key] = value;
  }
  return out;
}

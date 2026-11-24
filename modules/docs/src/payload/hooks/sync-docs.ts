import type { GlobalAfterChangeHook } from "payload";

import { settingsGroupName, updateModuleSettings } from "@acme/mod-kit/payload";

import type { DocsSettings } from "../settings";

/**
 * When an admin saves the Docs settings (Modules → Docs) with "Sync now" checked, pull docs
 * from GitHub, then write the result back (and untick syncNow). The write-back
 * re-fires this hook, so it's guarded with context.skipDocsSync to avoid a
 * loop (billing's sync-plan-to-stripe uses the same pattern). Failures land on
 * syncStatus/syncError rather than failing the save.
 */
export const syncDocsAfterChange: GlobalAfterChangeHook = async ({
  doc,
  req,
  context,
}) => {
  const settings = doc as DocsSettings;
  if (context.skipDocsSync) return settings;
  if (!settings.syncNow) return settings;

  let syncStatus: string;
  let syncError: string | null = null;
  try {
    // Lazy import keeps server-only sync code out of any client graph.
    const { syncDocsFromGitHub } = await import("../../server/sync");
    const r = await syncDocsFromGitHub(req.payload, settings, req);
    syncStatus = `Synced ${new Date().toISOString()}: +${r.created} created, ${r.updated} updated, ${r.skipped} unchanged, ${r.unpublished} unpublished.`;
  } catch (e) {
    syncStatus = "Last sync failed.";
    syncError = e instanceof Error ? e.message : String(e);
  }

  await updateModuleSettings(
    req.payload,
    { slug: "docs", groupName: settingsGroupName("docs") },
    { syncNow: false, syncStatus, syncError },
    { req, context: { skipDocsSync: true } },
  );

  return { ...settings, syncNow: false, syncStatus, syncError };
};

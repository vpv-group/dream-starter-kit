import type { GlobalAfterChangeHook } from "payload";

import { updateModuleSettings } from "@acme/mod-kit/payload";

import type { BillingTagSettings } from "../../server/core/tags";
import { createAdminClient } from "../../server/admin-client";
import { syncAllBillingTags } from "../../server/core/tags";

/**
 * "Re-sync every member's billing tags on save" (Billing → Tags): re-derive
 * all members' billing tags with the saved names, then untick the box and
 * stamp the result. The write-back re-fires this hook, so it's guarded with
 * `context.skipBillingTagResync` (the docs module's "Sync now" pattern).
 */
export const resyncTagsAfterChange: GlobalAfterChangeHook = async ({
  doc,
  req,
  context,
}) => {
  const tags = (doc as { tags?: BillingTagSettings & { resyncNow?: boolean } })
    .tags;
  const result = doc as Record<string, unknown>;
  if (context.skipBillingTagResync || !tags?.resyncNow) return result;
  let outcome: string;
  try {
    const n = await syncAllBillingTags(createAdminClient(), tags);
    outcome = `Re-synced ${n} member${n === 1 ? "" : "s"} at ${new Date().toISOString()}`;
  } catch (err) {
    outcome = `Failed: ${err instanceof Error ? err.message : String(err)}`;
    req.payload.logger.error({ err }, "billing: tag re-sync failed");
  }
  await updateModuleSettings(
    req.payload,
    { slug: "billing", groupName: "mod_billing" },
    {
      ...result,
      tags: { ...tags, resyncNow: false, lastResync: outcome },
    },
    { req, context: { skipBillingTagResync: true } },
  );
  return result;
};

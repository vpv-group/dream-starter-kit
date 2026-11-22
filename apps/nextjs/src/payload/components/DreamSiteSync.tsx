import { after } from "next/server";

import { getPayloadClient } from "~/lib/cms/payload-client";
import { syncDreamSite } from "~/lib/dream/site";

/**
 * /admin dashboard (Payload `beforeDashboard`): a fallback for deployments
 * without the daily cron (no CRON_SECRET). After the response is sent, it
 * registers/reports the free site license at most once a day. Renders
 * nothing and never delays the page.
 */
export function DreamSiteSync() {
  after(async () => {
    try {
      await syncDreamSite(await getPayloadClient());
    } catch (err) {
      console.error("[dream-site] sync skipped:", (err as Error).message);
    }
  });
  return null;
}

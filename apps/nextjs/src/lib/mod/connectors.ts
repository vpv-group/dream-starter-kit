import "server-only";

import type { CallOpts } from "./updates-core";
import { getPayloadClient } from "~/lib/cms/payload-client";
import { siteLicenseKey } from "~/lib/dream/site";
import { dreamRegistryUrl } from "./dream-registry";

/**
 * The signed-call options for meetdream.com, or null when the site has no
 * license key yet (or opted out with DREAM_TELEMETRY=off, which never
 * registers one). Server-only: the key never reaches the browser.
 */
export async function connectorCallOpts(): Promise<CallOpts | null> {
  try {
    const key = await siteLicenseKey(await getPayloadClient());
    return key ? { registry: dreamRegistryUrl(), siteKey: key } : null;
  } catch {
    return null;
  }
}

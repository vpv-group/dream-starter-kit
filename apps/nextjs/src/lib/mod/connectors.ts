import "server-only";

import type { CallOpts } from "./updates-core";
import { getPayloadClient } from "~/lib/cms/payload-client";
import { siteLicenseKey } from "~/lib/dream/site";
import { dreamRegistryUrl } from "./dream-registry";

/**
 * The signed-call options for meetdream.com, or null when the site has no
 * license key yet (or opted out with DREAM_TELEMETRY=off, which never
 * registers one). Server-only: the key never reaches the browser.
 *
 * The key is cached for a few minutes: connector lookups run inside Payload
 * hooks (catalog sync), and a fresh read each time would take an extra pool
 * connection while the save's transaction holds one. "No key" is cached
 * only briefly, so a site that registers (or a test that sets a key) is
 * picked up within seconds rather than minutes.
 */
const TTL_MS = 5 * 60_000;
const NO_KEY_TTL_MS = 15_000;
let cached: { key: string | null; at: number } | null = null;

export async function connectorCallOpts(): Promise<CallOpts | null> {
  try {
    const ttl = cached?.key ? TTL_MS : NO_KEY_TTL_MS;
    if (!cached || Date.now() - cached.at > ttl) {
      cached = {
        key: await siteLicenseKey(await getPayloadClient()),
        at: Date.now(),
      };
    }
    return cached.key
      ? { registry: dreamRegistryUrl(), siteKey: cached.key }
      : null;
  } catch {
    return null;
  }
}

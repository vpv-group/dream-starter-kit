import "server-only";

import type { ConnectTarget, SiteToken, UpdateSettings } from "./updates-core";
import { env } from "~/env";
import { getPayloadClient } from "~/lib/cms/payload-client";
import { siteLicenseKey } from "~/lib/dream/site";
import { dreamRegistryUrl } from "./dream-registry";
import {
  connectUrl,
  fetchSiteToken,
  fetchUpdates,
  saveSettings,
  tokenCache,
} from "./updates-core";

/**
 * App wiring for Dream Updates (updates-core.ts has the protocol). The site
 * key lives in the admin-only `dream-site` global and never reaches the
 * browser; /admin talks to staff-gated routes that call these.
 */

async function siteKey(): Promise<string | null> {
  try {
    return await siteLicenseKey(await getPayloadClient());
  } catch {
    return null;
  }
}

const NO_KEY = {
  status: "no-site-key",
  message:
    "This site hasn't registered with Meet Dream yet (it does after the first setup on a public domain).",
} as const;

export async function getUpdates() {
  const key = await siteKey();
  if (!key) return NO_KEY;
  return await fetchUpdates({ registry: dreamRegistryUrl(), siteKey: key });
}

export async function putUpdateSettings(
  settings: Omit<UpdateSettings, "pausedReason"> & { resume?: boolean },
) {
  const key = await siteKey();
  if (!key) return NO_KEY;
  return await saveSettings(
    { registry: dreamRegistryUrl(), siteKey: key },
    settings,
  );
}

export async function startConnect(target: ConnectTarget, returnTo: string) {
  const key = await siteKey();
  if (!key) return NO_KEY;
  return await connectUrl(
    { registry: dreamRegistryUrl(), siteKey: key },
    target,
    returnTo,
    env.NEXT_PUBLIC_SUPABASE_URL,
  );
}

const cache = tokenCache();

/**
 * The connected repository's token (cached ~55 min). It can start
 * module-ops.yml and read PRs and runs; it can't push code.
 */
export async function siteGithubToken(): Promise<
  { status: "ok"; token: SiteToken } | { status: string; message: string }
> {
  const cached = cache.get();
  if (cached) return { status: "ok", token: cached };
  const key = await siteKey();
  if (!key) return NO_KEY;
  const res = await fetchSiteToken({
    registry: dreamRegistryUrl(),
    siteKey: key,
  });
  if (res.status === "ok") cache.set(res.token);
  return res;
}

export function forgetGithubToken(): void {
  cache.clear();
}

import "server-only";

import type { BasePayload } from "payload";

import { KIT_VERSION } from "@acme/config";

import type { DreamSiteState, SitePeople, SiteSyncResult } from "./site-core";
import { env } from "~/env";
import { githubRepo } from "~/lib/mod/admin-ops";
import { dreamRegistryUrl } from "~/lib/mod/dream-registry";
import { getSiteUrl } from "~/lib/site-url";
import { DREAM_SITE_GLOBAL, publicDomain, syncSite } from "./site-core";

/**
 * App wiring for the free site license (site-core.ts has the flow).
 * Disclosed on /cms-setup; `DREAM_TELEMETRY=off` turns it off.
 */

export function siteTelemetryEnabled(): boolean {
  return env.DREAM_TELEMETRY !== "off";
}

export async function getDreamSite(
  payload: BasePayload,
): Promise<DreamSiteState> {
  return await payload.findGlobal({
    slug: DREAM_SITE_GLOBAL,
    overrideAccess: true,
    depth: 0,
  });
}

/** The site license key, if this deployment has registered. */
export async function siteLicenseKey(
  payload: BasePayload,
): Promise<string | null> {
  try {
    return (await getDreamSite(payload)).licenseKey ?? null;
  } catch {
    return null;
  }
}

/** Owner = the earliest admin; staff = every other admin/editor. */
async function sitePeople(payload: BasePayload): Promise<SitePeople> {
  const { docs } = await payload.find({
    collection: "users",
    where: { roles: { in: ["admin", "editor"] } },
    sort: "createdAt",
    depth: 0,
    limit: 200,
    overrideAccess: true,
  });
  const users = docs as { email?: string | null; roles?: string[] | null }[];
  const owner = users.find((u) => u.roles?.includes("admin") && u.email);
  return {
    owner: owner?.email ?? null,
    staff: users.flatMap((u) => (u !== owner && u.email ? [u.email] : [])),
  };
}

/** Register or report in (never throws). See site-core.ts → syncSite. */
export async function syncDreamSite(
  payload: BasePayload,
  opts: { force?: boolean; minIntervalMs?: number } = {},
): Promise<SiteSyncResult> {
  const result = await syncSite(
    {
      registry: dreamRegistryUrl(),
      domain: publicDomain(getSiteUrl()),
      telemetry: siteTelemetryEnabled(),
      kitVersion: KIT_VERSION,
      repo: githubRepo(),
      people: () => sitePeople(payload),
      load: () => getDreamSite(payload),
      save: async (patch) => {
        await payload.updateGlobal({
          slug: DREAM_SITE_GLOBAL,
          data: patch,
          overrideAccess: true,
          depth: 0,
        });
      },
    },
    opts,
  );
  if (result.status === "error") {
    console.error("[dream-site] site license sync failed:", result.message);
  }
  return result;
}

import "server-only";

import type { ServiceCheck } from "./services-core";
import { env } from "~/env";
import { getUpdates } from "~/lib/mod/updates";
import { isS3Configured } from "~/lib/s3-config";
import { getSiteUrl } from "~/lib/site-url";
import { serviceChecks } from "./services-core";

/** This deployment's host and database checks (services-core.ts). */
export async function getServiceChecks(): Promise<ServiceCheck[]> {
  const updates = await getUpdates();
  const ok = updates.status === "ok" ? updates : null;
  return serviceChecks({
    siteUrl: getSiteUrl(),
    env: { CRON_SECRET: env.CRON_SECRET },
    storageConfigured: isS3Configured(),
    authConfigured: Boolean(ok?.backendConfigured),
    canFixAuth: Boolean(ok?.canConfigureBackend),
  });
}

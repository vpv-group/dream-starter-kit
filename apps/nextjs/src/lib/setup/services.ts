import "server-only";

import type { SchedulerState, ServiceCheck } from "./services-core";
import { getUpdates } from "~/lib/mod/updates";
import { isS3Configured } from "~/lib/s3-config";
import { getSiteUrl } from "~/lib/site-url";
import { createAdminClient } from "~/lib/supabase/admin";
import { serviceChecks } from "./services-core";

/** Supabase Cron's state (public.kit_scheduler_status, service role). */
async function getSchedulerState(): Promise<SchedulerState> {
  try {
    const { data, error } = await createAdminClient().rpc(
      "kit_scheduler_status",
    );
    if (error) throw error;
    const s = data as {
      jobs?: number;
      app_url?: boolean;
      cron_secret?: boolean;
      last_ok_at?: string | null;
      last_failure_at?: string | null;
      last_failure?: string | null;
    };
    const okAt = s.last_ok_at ? Date.parse(s.last_ok_at) : null;
    const failAt = s.last_failure_at ? Date.parse(s.last_failure_at) : null;
    return {
      configured: Boolean(s.jobs && s.app_url && s.cron_secret),
      reachable:
        okAt === null && failAt === null ? null : (okAt ?? 0) >= (failAt ?? 0),
      lastFailure: s.last_failure ?? null,
    };
  } catch {
    // No service key or the migration hasn't run: report "not set up".
    return { configured: false, reachable: null };
  }
}

/** This deployment's host and database checks (services-core.ts). */
export async function getServiceChecks(): Promise<ServiceCheck[]> {
  const [updates, scheduler] = await Promise.all([
    getUpdates(),
    getSchedulerState(),
  ]);
  const ok = updates.status === "ok" ? updates : null;
  return serviceChecks({
    siteUrl: getSiteUrl(),
    scheduler,
    storageConfigured: isS3Configured(),
    authConfigured: Boolean(ok?.backendConfigured),
    canFixAuth: Boolean(ok?.canConfigureBackend),
  });
}

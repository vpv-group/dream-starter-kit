import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { env } from "~/env";
import { isCronAuthorized, resolveCronSecret } from "~/lib/cron-secret";
import { DAY_MS } from "~/lib/dream/site-core";

/**
 * Daily site-license report (docs/MODULES.md → Site license): registers this
 * deployment with meetdream.com if it hasn't yet, otherwise sends its kit
 * version + staff emails. Supabase Cron (`kit-dream-site-report`, daily) sends
 * `Authorization: Bearer ${CRON_SECRET}`. Without CRON_SECRET the same sync
 * runs at most daily when staff open /admin (DreamSiteSync).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handler(req: NextRequest): Promise<Response> {
  const cronEnv = {
    CRON_SECRET: env.CRON_SECRET,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
  };
  if (!resolveCronSecret(cronEnv)) {
    return NextResponse.json(
      { error: "No cron secret: set CRON_SECRET or SUPABASE_SERVICE_ROLE_KEY" },
      { status: 503 },
    );
  }
  if (!isCronAuthorized(req.headers.get("authorization"), cronEnv)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const { getPayloadClient } = await import("~/lib/cms/payload-client");
  const { syncDreamSite } = await import("~/lib/dream/site");
  let payload;
  try {
    payload = await getPayloadClient();
  } catch {
    return NextResponse.json({ error: "CMS unavailable" }, { status: 503 });
  }
  // Slightly under a day so a fixed daily schedule never trips the throttle.
  const result = await syncDreamSite(payload, { minIntervalMs: DAY_MS / 2 });
  return NextResponse.json(result);
}

export const GET = handler;
export const POST = handler;

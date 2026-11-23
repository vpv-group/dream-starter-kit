import { headers } from "next/headers";
import { NextResponse } from "next/server";

/**
 * "Generate license key" on System → Site License (docs/MODULES.md → Site
 * license). Deployments set up before site licenses existed never ran the
 * post-seed registration, and a failed attempt otherwise waits a day for the
 * next retry. This runs the same registration now, skipping the throttle.
 * Admin-only via the Payload admin session; the key never leaves the server
 * (the page reloads and reads it from the admin-only global).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SKIP_MESSAGES = {
  opted_out:
    "Site licenses are turned off on this deployment (DREAM_TELEMETRY=off).",
  no_public_domain:
    "This site has no public domain yet. Set NEXT_PUBLIC_SITE_URL to your public URL. Localhost and private hosts never register.",
  no_owner: "No admin user with an email was found to own the license.",
  throttled: "A registration attempt just ran. Try again in a moment.",
} as const;

export async function POST() {
  const { getPayloadClient } = await import("~/lib/cms/payload-client");
  const { syncDreamSite } = await import("~/lib/dream/site");
  let payload;
  try {
    payload = await getPayloadClient();
  } catch {
    return NextResponse.json({ error: "CMS unavailable" }, { status: 503 });
  }
  const { user } = await payload.auth({ headers: await headers() });
  if (!user?.roles.includes("admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncDreamSite(payload, { force: true });
  switch (result.status) {
    case "registered":
      return NextResponse.json({
        status: result.status,
        keyPrefix: result.keyPrefix,
      });
    case "reported":
      return NextResponse.json({ status: result.status });
    case "skipped":
      return NextResponse.json(
        { status: result.status, error: SKIP_MESSAGES[result.reason] },
        { status: 409 },
      );
    case "error":
      return NextResponse.json(
        { status: result.status, error: result.message },
        { status: 502 },
      );
  }
}

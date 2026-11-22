import { NextResponse } from "next/server";

import { DREAM_SITE_GLOBAL } from "~/lib/dream/site-core";

/**
 * Domain-control proof for the free site license (docs/MODULES.md → Site
 * license): while this deployment registers, the registry fetches this file
 * and expects the challenge nonce it just issued. Public by design — a nonce
 * is useless without the registry's signed challenge. 404 otherwise.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  let nonce: string | null;
  try {
    const { getPayloadClient } = await import("~/lib/cms/payload-client");
    const payload = await getPayloadClient();
    const site = (await payload.findGlobal({
      slug: DREAM_SITE_GLOBAL,
      overrideAccess: true,
      depth: 0,
    })) as { nonce?: string | null };
    nonce = site.nonce ?? null;
  } catch {
    nonce = null;
  }
  if (!nonce) {
    return NextResponse.json(
      { error: "not registering" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    { nonce },
    { headers: { "Cache-Control": "no-store" } },
  );
}

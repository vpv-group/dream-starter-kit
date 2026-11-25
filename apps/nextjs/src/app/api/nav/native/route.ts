import { NextResponse } from "next/server";

import { getNativeNavConfig } from "~/lib/mod/native-nav";

/**
 * Public, read-only iOS + Android app menu config — staff-edited on
 * /admin → Navigation ("iOS and Android App"). The Expo app reads it at
 * launch (`useNativeNav` in @acme/app), filters it per user, and caches the
 * result for offline use, so menu changes ship without an app release.
 *
 * Holds no secrets: menu labels/hrefs/icons plus each row's audience and the
 * name of its module's access-check function (both are already readable
 * over /cms-api). Briefly CDN-cacheable since it changes rarely.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getNativeNavConfig();
  return NextResponse.json(config, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}

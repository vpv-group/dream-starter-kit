import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getSiteUrl } from "~/lib/site-url";
import { createClient } from "~/lib/supabase/server";
import {
  encodePendingToken,
  PENDING_TOKEN_COOKIE,
  PENDING_TOKEN_MAX_AGE,
  WORKSPACE_TOKEN_RE,
} from "~/lib/workspaces/pending-token";

/**
 * Remember the invite in an httpOnly cookie, then: signed in → /welcome
 * (accepts it); signed out → the locked-email sign-in (JoinSignIn), or a
 * plain sign-in with ?other=1 ("Sign in with another account"). The cookie
 * survives the emailed magic-link / code hop that ends at /welcome.
 */
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const siteUrl = getSiteUrl();
  if (!WORKSPACE_TOKEN_RE.test(token)) {
    return NextResponse.redirect(
      `${siteUrl}/invite/${encodeURIComponent(token)}`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let target = `${siteUrl}/welcome`;
  if (!user || user.is_anonymous) {
    const { data } = await supabase.rpc("invitation_preview", {
      _token: token,
    });
    const preview = data?.[0];
    const query = new URLSearchParams({ invite: "1" });
    if (preview?.org_name) query.set("ws", preview.org_name);
    if (preview?.email && !req.nextUrl.searchParams.has("other")) {
      query.set("email", preview.email);
    }
    target = `${siteUrl}/sign-in?${query.toString()}`;
  }

  const res = NextResponse.redirect(target);
  res.cookies.set(
    PENDING_TOKEN_COOKIE,
    encodePendingToken({ kind: "invite", value: token }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: siteUrl.startsWith("https://"),
      path: "/",
      maxAge: PENDING_TOKEN_MAX_AGE,
    },
  );
  return res;
}

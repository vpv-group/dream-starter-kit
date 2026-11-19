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
 * Remember the invite link in an httpOnly cookie, then: signed in → /welcome
 * (joins); signed out → sign-up (?mode=signup) or sign-in, each saying
 * "Join {workspace}".
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
      `${siteUrl}/join/${encodeURIComponent(token)}`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let target = `${siteUrl}/welcome`;
  if (!user || user.is_anonymous) {
    const { data } = await supabase.rpc("join_link_preview", { _token: token });
    const query = new URLSearchParams({ invite: "1" });
    const name = data?.[0]?.org_name;
    if (name) query.set("ws", name);
    const page =
      req.nextUrl.searchParams.get("mode") === "signup" ? "sign-up" : "sign-in";
    target = `${siteUrl}/${page}?${query.toString()}`;
  }

  const res = NextResponse.redirect(target);
  res.cookies.set(
    PENDING_TOKEN_COOKIE,
    encodePendingToken({ kind: "join", value: token }),
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

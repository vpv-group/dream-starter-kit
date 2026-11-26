import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getRequestClient } from "~/lib/supabase/request-client";
import { VIEW_ORG_COOKIE } from "~/lib/workspaces/server";

/**
 * POST /api/workspaces/view — staff pick the workspace the header switcher
 * scopes to: `{ orgId: string | null }` (null = all workspaces). The id is
 * checked through `staff_workspaces` (staff only; refuses everyone else), then
 * stored in the httpOnly `view_org` cookie that `getWorkspaceView()` reads.
 */
export const dynamic = "force-dynamic";

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function POST(req: NextRequest) {
  const auth = await getRequestClient(req);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let orgId: string | null;
  try {
    const body = (await req.json()) as { orgId?: unknown };
    orgId = typeof body.orgId === "string" && body.orgId ? body.orgId : null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Staff check (and existence, when an id is given) in one call.
  const { data, error } = await auth.supabase.rpc("staff_workspaces", {
    _ids: orgId ? [orgId] : undefined,
    _limit: 1,
  });
  if (error) {
    return NextResponse.json(
      { error: "Only staff can switch workspaces here." },
      { status: 403 },
    );
  }
  if (orgId && !data[0]) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const res = NextResponse.json({ orgId });
  if (orgId) {
    res.cookies.set(VIEW_ORG_COOKIE, orgId, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.nextUrl.protocol === "https:",
      path: "/",
      maxAge: ONE_YEAR,
    });
  } else {
    res.cookies.delete(VIEW_ORG_COOKIE);
  }
  return res;
}

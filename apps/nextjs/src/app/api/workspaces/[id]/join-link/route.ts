import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { workspaceErrorMessage } from "@acme/app";

import { getAuthSettings } from "~/lib/payload";
import { getRequestClient } from "~/lib/supabase/request-client";
import { joinLink } from "~/lib/workspaces/invite-email";

/**
 * POST /api/workspaces/:id/join-link — owners/admins create or rotate the
 * workspace invite link (reset_join_link, as the caller). The old link stops
 * working; the new one is returned once: { link }. Refused when the founder
 * turned invite links off (Account model → allowInviteLinks).
 */
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getRequestClient(req);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await getAuthSettings();
  if (!settings.allowInviteLinks) {
    return NextResponse.json(
      { error: "Invite links are turned off for this app." },
      { status: 403 },
    );
  }
  const { id: orgId } = await params;
  const { data: token, error } = await auth.supabase.rpc("reset_join_link", {
    _org: orgId,
  });
  if (error) {
    return NextResponse.json(
      { error: workspaceErrorMessage(error, settings.workspaceLabel) },
      { status: error.message === "not_allowed" ? 403 : 400 },
    );
  }
  return NextResponse.json({ link: joinLink(token) });
}

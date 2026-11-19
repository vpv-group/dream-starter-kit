import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { workspaceErrorMessage } from "@acme/app";

import { getAuthSettings, getBranding } from "~/lib/payload";
import { getRequestClient } from "~/lib/supabase/request-client";
import { inviteLink, sendWorkspaceInvite } from "~/lib/workspaces/invite-email";

/**
 * POST /api/workspaces/:id/invitations/:invitationId/resend — rotate a
 * pending invite's token + expiry (resend_invitation, as the caller) and
 * email it again. Returns { result, link? } like the create route.
 */
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; invitationId: string }> },
) {
  const auth = await getRequestClient(req);
  if (!auth)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user, supabase } = auth;
  const { id: orgId, invitationId } = await params;
  const [settings, branding] = await Promise.all([
    getAuthSettings(),
    getBranding(),
  ]);

  const { data, error } = await supabase.rpc("resend_invitation", {
    _invitation_id: invitationId,
    _expires_days: settings.inviteExpiryDays,
  });
  const row = data?.[0];
  if (error || !row) {
    return NextResponse.json(
      { error: workspaceErrorMessage(error, settings.workspaceLabel) },
      { status: 400 },
    );
  }

  const [{ data: org }, { data: inviter }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId).single(),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle(),
  ]);
  const delivery = await sendWorkspaceInvite({
    email: row.invite_email,
    token: row.invite_token,
    workspaceName: org?.name ?? settings.workspaceLabel,
    inviterName: inviter?.display_name ?? null,
    appName: branding.appName,
  });
  return NextResponse.json(
    delivery === "existing_account"
      ? { result: delivery, link: inviteLink(row.invite_token) }
      : { result: delivery },
  );
}

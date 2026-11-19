import "server-only";

import { getSiteUrl } from "~/lib/site-url";
import { createAdminClient } from "~/lib/supabase/admin";

export type InviteDelivery = "sent" | "existing_account" | "send_failed";

/**
 * Email a workspace invite through Supabase's "Invite user" template
 * (supabase/templates/invite.html), which switches to workspace copy when the
 * metadata below is present. The link lands on /accept-invite (set a
 * password) and carries redirectTo = /invite/{token}, which joins the
 * workspace via /welcome?invite={token}.
 *
 * Supabase only sends that template to addresses WITHOUT an account. For an
 * existing account it refuses (`email_exists`) and we report
 * `existing_account`: the invite still shows up for them in-app (the "You've
 * been invited" screen and the workspace switcher), and the admin gets a
 * copyable link. The service-role client is server-only (golden rule #2);
 * permission checks already ran in create_invitations / resend_invitation.
 */
export async function sendWorkspaceInvite(input: {
  email: string;
  token: string;
  workspaceName: string;
  inviterName: string | null;
  appName: string;
}): Promise<InviteDelivery> {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(input.email, {
    redirectTo: inviteLink(input.token),
    data: {
      invited_to_workspace: input.workspaceName,
      invited_by_name: input.inviterName ?? undefined,
      app_name: input.appName,
    },
  });
  if (!error) return "sent";
  if (error.code === "email_exists" || error.code === "user_already_exists") {
    return "existing_account";
  }
  console.error("[workspace-invite] inviteUserByEmail failed", error.message);
  return "send_failed";
}

export function inviteLink(token: string): string {
  return `${getSiteUrl()}/invite/${encodeURIComponent(token)}`;
}

export function joinLink(token: string): string {
  return `${getSiteUrl()}/join/${encodeURIComponent(token)}`;
}

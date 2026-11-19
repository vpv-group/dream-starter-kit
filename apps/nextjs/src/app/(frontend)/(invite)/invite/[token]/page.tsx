import { redirect } from "next/navigation";

import { inviteProblemFromCode, isWorkspaceMode } from "@acme/app";

import { InviteLanding } from "~/components/invites/invite-landing";
import { InviteProblem } from "~/components/invites/invite-problem";
import { getAuthSettings, getBranding } from "~/lib/payload";
import { createClient } from "~/lib/supabase/server";
import { WORKSPACE_TOKEN_RE } from "~/lib/workspaces/pending-token";

export const metadata = { title: "Join workspace", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Public email-invite page (wireframes InviteLanding / InviteProblem).
 *  - unknown / expired / revoked / used → InviteProblem
 *  - signed in as the invited address → accept (via /continue → /welcome)
 *  - signed in as someone else → InviteProblem "wrong account"
 *  - signed out → InviteLanding → /continue → locked-email sign-in
 * /welcome bounces back here with ?error= when acceptance fails.
 */
export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error: errorCode } = await searchParams;
  const [settings, branding] = await Promise.all([
    getAuthSettings(),
    getBranding(),
  ]);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const signedInEmail =
    user && !user.is_anonymous ? (user.email ?? null) : null;

  const { data } = WORKSPACE_TOKEN_RE.test(token)
    ? await supabase.rpc("invitation_preview", { _token: token })
    : { data: null };
  const preview = data?.[0];

  const common = {
    branding,
    returnTo: `/invite/${token}`,
    workspaceName: preview?.org_name ?? null,
    inviterName: preview?.inviter_name ?? null,
    invitedEmail: preview?.email ?? null,
    signedInEmail,
    expiresAt: preview?.expires_at ?? null,
    inviteExpiryDays: settings.inviteExpiryDays,
    workspaceLabel: settings.workspaceLabel,
    canCreateWorkspace: isWorkspaceMode(settings),
  };

  if (preview?.status !== "valid") {
    const status = preview?.status;
    const kind =
      status === "expired" || status === "revoked" || status === "used"
        ? status
        : "not_found";
    return <InviteProblem {...common} kind={kind} />;
  }

  const fromWelcome = inviteProblemFromCode(errorCode);
  if (fromWelcome) return <InviteProblem {...common} kind={fromWelcome} />;

  if (signedInEmail) {
    if (signedInEmail.toLowerCase() !== preview.email.toLowerCase()) {
      return <InviteProblem {...common} kind="wrong_account" />;
    }
    redirect(`/invite/${token}/continue`);
  }

  return (
    <InviteLanding
      branding={branding}
      workspaceName={preview.org_name}
      workspaceUrl={`${settings.workspaceUrlPrefix ?? ""}${preview.org_slug}`}
      logoUrl={preview.logo_url}
      inviterName={preview.inviter_name}
      role={preview.role}
      invitedEmail={preview.email}
      continueHref={`/invite/${token}/continue`}
      signInHref={`/invite/${token}/continue?other=1`}
    />
  );
}

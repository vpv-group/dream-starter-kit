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
 * Public invite-link page. Signed in → join (via /continue → /welcome);
 * signed out → create an account or sign in, then join. Off when the founder
 * disabled invite links or the workspace turned its link off.
 */
export default async function JoinPage({
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
    ? await supabase.rpc("join_link_preview", { _token: token })
    : { data: null };
  const preview = data?.[0];

  const common = {
    branding,
    returnTo: `/join/${token}`,
    workspaceName: preview?.org_name ?? null,
    inviterName: null,
    invitedEmail: null,
    signedInEmail,
    expiresAt: null,
    inviteExpiryDays: settings.inviteExpiryDays,
    allowedDomains: preview?.allowed_domains ?? [],
    workspaceLabel: settings.workspaceLabel,
    canCreateWorkspace: isWorkspaceMode(settings),
  };

  if (
    !isWorkspaceMode(settings) ||
    !preview ||
    preview.status === "not_found"
  ) {
    return <InviteProblem {...common} kind="not_found" />;
  }
  if (preview.status === "disabled" || !settings.allowInviteLinks) {
    return <InviteProblem {...common} kind="disabled" />;
  }
  const fromWelcome = inviteProblemFromCode(errorCode);
  if (fromWelcome) return <InviteProblem {...common} kind={fromWelcome} />;

  if (signedInEmail) redirect(`/join/${token}/continue`);

  return (
    <InviteLanding
      branding={branding}
      workspaceName={preview.org_name}
      workspaceUrl={`${settings.workspaceUrlPrefix ?? ""}${preview.org_slug}`}
      logoUrl={preview.logo_url}
      inviterName={null}
      role="member"
      invitedEmail={null}
      allowedDomains={preview.allowed_domains}
      continueHref={`/join/${token}/continue?mode=signup`}
      signInHref={`/join/${token}/continue`}
    />
  );
}

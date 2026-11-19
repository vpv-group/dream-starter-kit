import { redirect } from "next/navigation";

import type { PendingInvitation } from "@acme/app";

import { PendingInvites } from "~/components/onboarding/pending-invites";
import { getBranding } from "~/lib/payload";
import { createClient } from "~/lib/supabase/server";
import { getWorkspaceContext } from "~/lib/workspaces/server";

export const metadata = { title: "You've been invited" };

/** Plain sign-up with pending invites: Join, or create your own. */
export default async function PendingInvitesPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/sign-in");
  const supabase = await createClient();
  const [{ data }, branding] = await Promise.all([
    supabase.rpc("my_pending_invitations"),
    getBranding(),
  ]);
  const invitations: PendingInvitation[] = (data ?? []).map((r) => ({
    invitationId: r.invitation_id,
    orgId: r.org_id,
    orgName: r.org_name,
    orgSlug: r.org_slug,
    logoUrl: r.logo_url,
    inviterName: r.inviter_name,
    role: r.role,
    expiresAt: r.expires_at,
  }));
  if (invitations.length === 0) {
    redirect(ctx.workspaces.length > 0 ? "/a" : "/onboarding/workspace");
  }

  return (
    <PendingInvites
      branding={branding}
      email={ctx.profile.email}
      invitations={invitations}
      workspaceLabel={ctx.settings.workspaceLabel}
    />
  );
}

import { notFound, redirect } from "next/navigation";

import { WorkspaceSettings } from "~/components/workspaces/workspace-settings";
import { createClient } from "~/lib/supabase/server";
import { getWorkspaceContext } from "~/lib/workspaces/server";

export const metadata = { title: "Workspace settings" };

/** Settings → Members for the active workspace (Teams / Both only). */
export default async function WorkspaceSettingsPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/sign-in");
  if (!ctx.workspaceMode) notFound();
  const active = ctx.active;
  if (!active) redirect("/onboarding/workspace");

  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("join_link_enabled, join_token_hash, allowed_domains")
    .eq("id", active.id)
    .single();

  return (
    <WorkspaceSettings
      orgId={active.id}
      workspaceName={active.name}
      workspaceSlug={active.slug}
      myRole={active.role}
      workspaceLabel={ctx.settings.workspaceLabel}
      urlPrefix={ctx.settings.workspaceUrlPrefix ?? ""}
      allowInviteLinks={ctx.settings.allowInviteLinks}
      inviteExpiryDays={ctx.settings.inviteExpiryDays}
      joinLink={{
        enabled: org?.join_link_enabled ?? false,
        exists: Boolean(org?.join_token_hash),
        allowedDomains: org?.allowed_domains ?? [],
      }}
    />
  );
}

import { redirect } from "next/navigation";

import { InviteStep } from "~/components/onboarding/invite-step";
import { getBranding } from "~/lib/payload";
import { createClient } from "~/lib/supabase/server";
import { getStepContext } from "~/lib/workspaces/server";

export const metadata = { title: "Invite your team" };

/** Welcome step: invite teammates (wireframe Invite). Owners/admins only. */
export default async function InviteStepPage() {
  const step = await getStepContext("invite");
  if ("redirect" in step) redirect(step.redirect);
  const { ctx, active } = step;
  const supabase = await createClient();
  const [branding, { data: org }] = await Promise.all([
    getBranding(),
    supabase
      .from("organizations")
      .select("allowed_domains")
      .eq("id", active.id)
      .single(),
  ]);

  return (
    <InviteStep
      branding={branding}
      orgId={active.id}
      workspaceName={active.name}
      workspaceLabel={ctx.settings.workspaceLabel}
      me={{ name: ctx.profile.displayName ?? "", email: ctx.profile.email }}
      allowInviteLinks={ctx.settings.allowInviteLinks}
      allowedDomains={org?.allowed_domains ?? []}
      inviteExpiryDays={ctx.settings.inviteExpiryDays}
      stepIndex={step.index}
      stepTotal={step.steps.length}
      nextStepKey={step.next?.key ?? null}
      nextPath={step.nextPath}
      showProgress={!step.revisit}
    />
  );
}

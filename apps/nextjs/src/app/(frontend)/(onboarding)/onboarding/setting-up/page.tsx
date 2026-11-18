import { redirect } from "next/navigation";

import { SettingUp } from "~/components/onboarding/setting-up";
import { getBranding } from "~/lib/payload";
import { getWorkspaceContext, stepsForMember } from "~/lib/workspaces/server";

export const metadata = { title: "Setting up" };

/** Splash while workspace-created hooks run (wireframe SettingUp). */
export default async function SettingUpPage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/sign-in");
  const active = ctx.active;
  if (!active) redirect("/onboarding/workspace");

  const steps = stepsForMember(ctx.settings, active);
  const first = steps[0] ?? null;
  const branding = await getBranding();

  return (
    <SettingUp
      branding={branding}
      orgId={active.id}
      workspaceName={active.name}
      firstStepKey={first?.key ?? null}
      nextPath={first?.path ?? "/a"}
    />
  );
}

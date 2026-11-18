import { redirect } from "next/navigation";

import { ProfileStep } from "~/components/onboarding/profile-step";
import { getBranding } from "~/lib/payload";
import { getStepContext } from "~/lib/workspaces/server";

export const metadata = { title: "Set up your profile" };

/** Welcome step: name, avatar, title (wireframe Profile). */
export default async function ProfileStepPage() {
  const step = await getStepContext("profile");
  if ("redirect" in step) redirect(step.redirect);
  const branding = await getBranding();
  const { ctx, active } = step;

  return (
    <ProfileStep
      branding={branding}
      orgId={active.id}
      workspaceName={active.name}
      role={active.role}
      userId={ctx.profile.id}
      email={ctx.profile.email}
      initialName={ctx.profile.displayName ?? ""}
      initialTitle={ctx.profile.title ?? ""}
      initialAvatarUrl={ctx.profile.avatarUrl}
      stepIndex={step.index}
      stepTotal={step.steps.length}
      nextStepKey={step.next?.key ?? null}
      nextPath={step.nextPath}
      showProgress={!step.revisit}
    />
  );
}

import { redirect } from "next/navigation";

import { readEmailPreferences } from "@acme/app";

import { UpdatesStep } from "~/components/onboarding/updates-step";
import { getBranding } from "~/lib/payload";
import { getStepContext } from "~/lib/workspaces/server";

export const metadata = { title: "Stay in the loop" };

/** Welcome step: email preferences (wireframe Updates). */
export default async function UpdatesStepPage() {
  const step = await getStepContext("updates");
  if ("redirect" in step) redirect(step.redirect);
  const branding = await getBranding();
  const { ctx, active } = step;

  return (
    <UpdatesStep
      branding={branding}
      orgId={active.id}
      userId={ctx.profile.id}
      workspaceName={active.name}
      initial={readEmailPreferences(ctx.profile.emailPreferences)}
      steps={step.steps.map((s) => ({ key: s.key, title: s.title }))}
      done={active.onboardingDone}
      stepIndex={step.index}
      nextStepKey={step.next?.key ?? null}
      nextPath={step.nextPath}
      showProgress={!step.revisit}
    />
  );
}

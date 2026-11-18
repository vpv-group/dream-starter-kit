import { redirect } from "next/navigation";

import { HybridChoiceForm } from "~/components/onboarding/hybrid-choice-form";
import { OnboardingShell } from "~/components/onboarding/onboarding-shell";
import { getBranding } from "~/lib/payload";
import { getWorkspaceContext } from "~/lib/workspaces/server";

export const metadata = { title: "How will you use it" };

/** Both mode: "For myself" / "With my team", asked once (wireframe Hybrid). */
export default async function ChoosePage() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.settings.accountModel !== "hybrid") redirect("/onboarding/workspace");
  const branding = await getBranding();

  return (
    <OnboardingShell branding={branding} headerRight={ctx.profile.email} wide>
      <div className="mx-auto max-w-[640px]">
        <HybridChoiceForm
          appName={branding.appName}
          workspaceLabel={ctx.settings.workspaceLabel}
        />
      </div>
    </OnboardingShell>
  );
}

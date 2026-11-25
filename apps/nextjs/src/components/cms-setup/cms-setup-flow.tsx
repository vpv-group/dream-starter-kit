"use client";

import { useState } from "react";

import type { Branding } from "~/lib/payload";
import type { SetupContext } from "~/lib/setup/steps";
import { AccountModelPicker } from "~/components/cms-setup/account-model-picker";
import { CmsSeedProgress } from "~/components/cms-setup/cms-seed-progress";
import { StepEyebrow } from "~/components/onboarding/step-progress";
import { stepPosition } from "~/lib/setup/steps";

/**
 * /cms-setup: when the account model has never been chosen, the founder
 * picks it first, then the seed progress runs. On a public deployment the
 * seed registers the site with Meet Dream, and the founder continues to
 * /cms-setup/connect-code and /cms-setup/app-updates (lib/setup/steps.ts
 * numbers them; each skips itself when it doesn't apply).
 */
export function CmsSetupFlow({
  branding,
  steps,
  licenseNotice,
}: {
  branding: Branding;
  steps: SetupContext;
  /** The site-license disclosure, rendered under the seed progress. */
  licenseNotice?: React.ReactNode;
}) {
  const [phase, setPhase] = useState<"model" | "seed">(
    steps.askAccountModel ? "model" : "seed",
  );

  if (phase === "model") {
    return (
      <AccountModelPicker
        branding={branding}
        position={stepPosition("account-model", steps)}
        onDone={() => setPhase("seed")}
      />
    );
  }
  const content = stepPosition("content", steps);
  return (
    <CmsSeedProgress
      notice={licenseNotice}
      stepLabel={
        content && content.total !== "01" ? (
          <StepEyebrow index={content.index} total={content.total} />
        ) : undefined
      }
    />
  );
}

"use client";

import { useState } from "react";

import type { Branding } from "~/lib/payload";
import { AccountModelPicker } from "~/components/cms-setup/account-model-picker";
import { CmsSeedProgress } from "~/components/cms-setup/cms-seed-progress";
import { StepEyebrow } from "~/components/onboarding/step-progress";

/**
 * /cms-setup: when the account model has never been chosen, the founder
 * picks it first (step 01 / 02), then the existing seed progress runs
 * (step 02 / 02). Otherwise the seed progress renders exactly as before.
 */
export function CmsSetupFlow({
  branding,
  askAccountModel,
  notice,
}: {
  branding: Branding;
  askAccountModel: boolean;
  /** Disclosure shown while seeding (the free site license). */
  notice?: React.ReactNode;
}) {
  const [phase, setPhase] = useState<"model" | "seed">(
    askAccountModel ? "model" : "seed",
  );

  if (phase === "model") {
    return (
      <AccountModelPicker
        branding={branding}
        notice={notice}
        onDone={() => setPhase("seed")}
      />
    );
  }
  return (
    <CmsSeedProgress
      notice={notice}
      stepLabel={
        askAccountModel ? <StepEyebrow index="02" total="02" /> : undefined
      }
    />
  );
}

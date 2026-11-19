"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Users } from "lucide-react";

import type { SignupIntent } from "@acme/app";
import { labelWithArticle, useSetSignupIntent } from "@acme/app";

import type { ChoiceOption } from "~/components/onboarding/choice-cards";
import { ChoiceCards } from "~/components/onboarding/choice-cards";
import { StepHeading } from "~/components/onboarding/onboarding-shell";
import { Button } from "~/components/ui/button";
import { FieldError } from "~/components/ui/field";
import { Spinner } from "~/components/ui/spinner";

/** Both mode, asked once after email proof (wireframe Hybrid). */
export function HybridChoiceForm({
  appName,
  workspaceLabel,
}: {
  appName: string;
  workspaceLabel: string;
}) {
  const router = useRouter();
  const setIntent = useSetSignupIntent();
  const [choice, setChoice] = useState<SignupIntent>("team");
  const [error, setError] = useState<string | null>(null);

  const options: ChoiceOption<SignupIntent>[] = [
    {
      value: "personal",
      title: "For myself",
      description: "Your own account. Nothing is shared with anyone.",
      icon: User,
    },
    {
      value: "team",
      title: "With my team",
      description: `Create ${labelWithArticle(workspaceLabel)} and invite the people you work with.`,
      icon: Users,
    },
  ];

  async function onContinue() {
    setError(null);
    try {
      await setIntent.mutateAsync(choice);
    } catch {
      setError("Couldn't save your choice. Please try again.");
      return;
    }
    if (choice === "personal") window.location.assign("/a");
    else router.push("/onboarding/workspace");
  }

  return (
    <div className="flex flex-col gap-6">
      <StepHeading
        title={`How will you use ${appName}?`}
        description={`You can create or join ${labelWithArticle(workspaceLabel)} any time from your account menu.`}
      />
      <ChoiceCards
        name="signup-intent"
        options={options}
        value={choice}
        onValueChange={setChoice}
        columns={2}
      />
      {error ? <FieldError>{error}</FieldError> : null}
      <div className="flex justify-end">
        <Button
          size="lg"
          className="w-full sm:w-48"
          onClick={() => void onContinue()}
          disabled={setIntent.isPending}
        >
          {setIntent.isPending ? <Spinner /> : null}
          Continue
        </Button>
      </div>
    </div>
  );
}

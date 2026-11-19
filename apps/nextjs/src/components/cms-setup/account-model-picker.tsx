"use client";

import { useState } from "react";
import { Building2, User, Users } from "lucide-react";

import type { AccountModel } from "@acme/app";

import type { ChoiceOption } from "~/components/onboarding/choice-cards";
import type { Branding } from "~/lib/payload";
import { ChoiceCards } from "~/components/onboarding/choice-cards";
import { OnboardingBrand } from "~/components/onboarding/onboarding-brand";
import { StepHeading } from "~/components/onboarding/onboarding-shell";
import { StepEyebrow } from "~/components/onboarding/step-progress";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { FieldError } from "~/components/ui/field";
import { Spinner } from "~/components/ui/spinner";

const OPTIONS: ChoiceOption<AccountModel>[] = [
  {
    value: "consumer",
    title: "Individuals",
    description:
      "Each person signs up for themselves. Members, customers, clients.",
    note: "Sign-up stays as it is today.",
    icon: User,
  },
  {
    value: "business",
    title: "Teams and companies",
    description:
      "People work together in a shared workspace. The first person creates it and invites the rest.",
    note: "Adds workspaces, invites and a member list.",
    icon: Users,
  },
  {
    value: "hybrid",
    title: "Both",
    description:
      "Personal by default. Anyone can create or join a workspace later.",
    note: "Asks new people once: for myself, or with my team.",
    icon: Building2,
  },
];

/**
 * Founder step 1 of /cms-setup (wireframe AccountModel): "Who signs up for
 * your app?" Saves the account model, then hands over to the seed progress.
 */
export function AccountModelPicker({
  branding,
  onDone,
}: {
  branding: Branding;
  onDone: () => void;
}) {
  const [choice, setChoice] = useState<AccountModel>("consumer");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onContinue() {
    setSaving(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch("/api/cms/account-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountModel: choice }),
      });
    } catch {
      setSaving(false);
      setError("Couldn't reach the server. Please retry.");
      return;
    }
    if (res.status === 401) {
      window.location.assign("/a");
      return;
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setSaving(false);
      setError(
        data?.error ?? `The server reported an error (HTTP ${res.status}).`,
      );
      return;
    }
    onDone();
  }

  return (
    <div className="bg-background flex min-h-svh flex-col px-4 py-6 min-[760px]:px-14 min-[760px]:py-10">
      <header className="flex items-center justify-between gap-4">
        <OnboardingBrand branding={branding} />
        <Badge variant="secondary">Admin setup</Badge>
      </header>
      <main className="flex flex-1 items-center justify-center py-10">
        <div className="flex w-full max-w-[960px] flex-col gap-6">
          <div className="flex flex-col gap-4">
            <StepEyebrow index="01" total="02" />
            <StepHeading
              title="Who signs up for your app?"
              description="This sets how sign-up works for everyone after you. You can change it later in Admin › Authentication."
            />
          </div>
          <ChoiceCards
            name="account-model"
            options={OPTIONS}
            value={choice}
            onValueChange={setChoice}
            columns={3}
          />
          {error ? <FieldError>{error}</FieldError> : null}
          <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">
              Who: <span className="text-foreground">you, the admin</span>
              <span className="px-2" aria-hidden />
              How long: <span className="text-foreground">
                under a minute
              </span>{" "}
              (estimate)
            </p>
            <Button
              size="lg"
              className="w-full sm:w-48"
              disabled={saving}
              onClick={() => void onContinue()}
            >
              {saving ? <Spinner /> : null}
              Continue
            </Button>
          </div>
        </div>
      </main>
      <footer className="text-muted-foreground text-sm">
        Next we add sample content to your CMS.
      </footer>
    </div>
  );
}

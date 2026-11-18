"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { EmailPreferences } from "@acme/app";
import { useSupabase } from "@acme/api";
import { useSaveOnboardingProgress } from "@acme/app";
import { toast } from "@acme/ui/toast";

import type { Branding } from "~/lib/payload";
import { useBranding } from "~/components/branding-provider";
import {
  OnboardingShell,
  StepHeading,
} from "~/components/onboarding/onboarding-shell";
import { SetupChecklistItems } from "~/components/onboarding/setup-checklist";
import { StepProgress } from "~/components/onboarding/step-progress";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "~/components/ui/field";
import { Spinner } from "~/components/ui/spinner";
import { Switch } from "~/components/ui/switch";

/** Welcome step: what we email you (wireframe Updates). */
export function UpdatesStep(props: {
  branding: Branding;
  orgId: string;
  userId: string;
  workspaceName: string;
  initial: EmailPreferences;
  steps: { key: string; title: string }[];
  done: string[];
  stepIndex: number;
  nextStepKey: string | null;
  nextPath: string;
  showProgress: boolean;
}) {
  const router = useRouter();
  const supabase = useSupabase();
  const save = useSaveOnboardingProgress();
  const { appName } = useBranding();
  const [prefs, setPrefs] = useState<EmailPreferences>(props.initial);
  const [saving, setSaving] = useState(false);
  const isLast = props.nextStepKey === null;

  async function onFinish(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ email_preferences: prefs })
      .eq("id", props.userId);
    if (error) {
      setSaving(false);
      toast.error("Couldn't save your choices. Please try again.");
      return;
    }
    try {
      await save.mutateAsync({
        orgId: props.orgId,
        step: props.nextStepKey ?? "updates",
        completed: isLast && props.showProgress,
        done: "updates",
      });
    } catch {
      setSaving(false);
      toast.error("Couldn't save your progress. Please try again.");
      return;
    }
    router.push(props.nextPath);
  }

  const preview = (
    <Card className="py-2">
      <CardContent className="px-5">
        <SetupChecklistItems
          items={props.steps.map((s, i) => ({
            key: s.key,
            number: i + 1,
            title: s.title,
            status:
              i === props.stepIndex
                ? "current"
                : props.done.includes(s.key)
                  ? "done"
                  : i < props.stepIndex
                    ? "skipped"
                    : "upcoming",
          }))}
        />
      </CardContent>
    </Card>
  );

  return (
    <OnboardingShell
      branding={props.branding}
      headerRight={props.workspaceName}
      preview={preview}
      previewLabel="Your setup"
    >
      <form onSubmit={(e) => void onFinish(e)} className="flex flex-col gap-6">
        <StepProgress
          total={props.steps.length}
          current={props.stepIndex}
          showBar={props.showProgress}
        />
        <StepHeading
          title="Stay in the loop"
          description="Choose what we email you. Change this any time in Settings."
        />
        <FieldGroup className="gap-0 border-y">
          <Field orientation="horizontal" className="py-4">
            <FieldContent>
              <FieldLabel htmlFor="pref-tips">Getting started tips</FieldLabel>
              <FieldDescription>
                A short series for your first weeks.
              </FieldDescription>
            </FieldContent>
            <Switch
              id="pref-tips"
              checked={prefs.tips}
              onCheckedChange={(tips) => setPrefs((p) => ({ ...p, tips }))}
            />
          </Field>
          <FieldSeparator className="h-px" />
          <Field orientation="horizontal" className="py-4">
            <FieldContent>
              <FieldLabel htmlFor="pref-product">Product updates</FieldLabel>
              <FieldDescription>What&apos;s new in {appName}.</FieldDescription>
            </FieldContent>
            <Switch
              id="pref-product"
              checked={prefs.product_updates}
              onCheckedChange={(product_updates) =>
                setPrefs((p) => ({ ...p, product_updates }))
              }
            />
          </Field>
        </FieldGroup>
        <Button type="submit" size="lg" className="w-full" disabled={saving}>
          {saving ? <Spinner /> : null}
          {isLast ? "Finish" : "Continue"}
        </Button>
      </form>
    </OnboardingShell>
  );
}

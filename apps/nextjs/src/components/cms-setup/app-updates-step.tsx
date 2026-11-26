"use client";

import { useState } from "react";
import { Eye, Hand, Zap } from "lucide-react";

import type { ChoiceOption } from "~/components/onboarding/choice-cards";
import type { Branding } from "~/lib/payload";
import { ChoiceCards } from "~/components/onboarding/choice-cards";
import { SetupStep } from "~/components/setup/setup-step";
import { Button } from "~/components/ui/button";
import { FieldError } from "~/components/ui/field";
import { Spinner } from "~/components/ui/spinner";

type Mode = "automatic" | "review" | "manual";

const OPTIONS: ChoiceOption<Mode>[] = [
  {
    value: "automatic",
    title: "Install updates automatically",
    description:
      "Updates merge themselves once every check passes and nothing conflicts.",
    note: "Recommended. Anything risky still waits for you.",
    icon: Zap,
  },
  {
    value: "review",
    title: "Review each update",
    description:
      "Updates arrive as pull requests. You look at each one and merge it.",
    note: "Good when someone reviews every change.",
    icon: Eye,
  },
  {
    value: "manual",
    title: "I'll update it myself",
    description:
      "Nothing opens on its own. You update from GitHub or the command line.",
    note: "You can still click Check now in Admin › Updates.",
    icon: Hand,
  },
];

const SETTINGS: Record<Mode, { autoUpdate: boolean; autoMerge: boolean }> = {
  automatic: { autoUpdate: true, autoMerge: true },
  review: { autoUpdate: true, autoMerge: false },
  manual: { autoUpdate: false, autoMerge: false },
};

/** Founder step: how updates go live (writes the update settings). */
export function AppUpdatesStep({
  branding,
  position,
  repo,
  initial,
}: {
  branding: Branding;
  position: { index: string; total: string };
  repo: string | null;
  initial: Mode;
}) {
  const [choice, setChoice] = useState<Mode>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onContinue() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/modules/updates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...SETTINGS[choice], paused: [], skipped: [] }),
      });
      if (res.ok) {
        window.location.assign("/cms-setup/services");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      setError(
        data.message ?? data.error ?? `Couldn't save (HTTP ${res.status}).`,
      );
    } catch {
      setError("Couldn't reach the server. Please retry.");
    }
    setSaving(false);
  }

  return (
    <SetupStep
      branding={branding}
      position={position}
      title="How should your app stay up to date?"
      description={`${repo ? `Connected to ${repo}. ` : ""}You can change this later in Admin › Updates.`}
      howLong="under a minute"
      next="Next we check your hosting and database settings."
      actions={
        <Button
          size="lg"
          className="w-full sm:w-48"
          disabled={saving}
          onClick={() => void onContinue()}
        >
          {saving ? <Spinner /> : null}
          Continue
        </Button>
      }
    >
      <ChoiceCards
        name="app-updates"
        options={OPTIONS}
        value={choice}
        onValueChange={setChoice}
        columns={3}
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </SetupStep>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useSaveOnboardingProgress } from "@acme/app";

import type { Branding } from "~/lib/payload";
import { Progress } from "~/components/ui/progress";

/** Never hold anyone here longer than this; the fallback link appears too. */
const MAX_MS = 3000;
const MIN_MS = 1200;

/**
 * Splash while the workspace is prepared (wireframe SettingUp). Records the
 * first onboarding step so /welcome can resume here, then forwards. Module
 * `onWorkspaceCreated` hooks (starter content) plug in here in PR 3; nothing
 * on this screen ever blocks on a failure.
 */
export function SettingUp({
  branding,
  orgId,
  workspaceName,
  firstStepKey,
  nextPath,
}: {
  branding: Branding;
  orgId: string;
  workspaceName: string;
  firstStepKey: string | null;
  nextPath: string;
}) {
  const router = useRouter();
  const save = useSaveOnboardingProgress();
  const [percent, setPercent] = useState(8);
  const [slow, setSlow] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const startedAt = Date.now();

    const tick = setInterval(() => {
      setPercent((p) => Math.min(92, p + 7));
    }, 120);
    const slowTimer = setTimeout(() => setSlow(true), MAX_MS);

    const work = save
      .mutateAsync(
        firstStepKey
          ? { orgId, step: firstStepKey }
          : // No welcome steps enabled: onboarding is finished on creation.
            { orgId, step: "done", completed: true },
      )
      .catch((error: unknown) => {
        console.warn("[setting-up] couldn't save onboarding progress", error);
      });

    void work.then(async () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_MS) {
        await new Promise((r) => setTimeout(r, MIN_MS - elapsed));
      }
      clearInterval(tick);
      setPercent(100);
      router.replace(nextPath);
    });

    return () => {
      clearInterval(tick);
      clearTimeout(slowTimer);
    };
    // Runs once on mount; `save` is stable for our purposes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="bg-background flex min-h-svh flex-col items-center justify-between px-4 py-10">
      <span />
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={branding.appIconUrl ?? "/favicon.svg"}
          alt=""
          aria-hidden
          className="size-16"
        />
        <h1 className="text-xl font-semibold">Setting up {workspaceName}</h1>
        <p className="text-muted-foreground text-sm">
          Adding your starter content. This usually takes a few seconds.
        </p>
        <Progress
          value={percent}
          className="mt-2 w-64"
          aria-label={`Setting up ${workspaceName}`}
        />
      </div>
      <p
        className={
          slow
            ? "text-muted-foreground text-sm"
            : "text-muted-foreground invisible text-sm"
        }
      >
        Taking longer than usual?{" "}
        <a
          href={nextPath}
          className="text-primary underline underline-offset-4"
        >
          Continue
        </a>
      </p>
    </main>
  );
}

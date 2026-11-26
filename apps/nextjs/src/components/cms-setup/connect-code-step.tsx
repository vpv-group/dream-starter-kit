"use client";

import { useState } from "react";
import { GitPullRequest, LockKeyhole, Package } from "lucide-react";

import type { Branding } from "~/lib/payload";
import { SetupStep } from "~/components/setup/setup-step";
import { Button } from "~/components/ui/button";
import { FieldError } from "~/components/ui/field";
import { Spinner } from "~/components/ui/spinner";

const POINTS = [
  {
    icon: GitPullRequest,
    title: "Updates arrive as pull requests",
    text: "New starter kit releases and module updates open a pull request on your repository, with all your checks run first.",
  },
  {
    icon: Package,
    title: "Install modules in one click",
    text: "Modules you install from the catalog in Admin arrive the same way.",
  },
  {
    icon: LockKeyhole,
    title: "One repository, short-lived access",
    text: "You choose one repository on GitHub. Meet Dream gets one-hour access to it for updates and stores no tokens in your repository. Remove the app on GitHub at any time.",
  },
];

/** Founder step: connect the app's GitHub repository (Meet Dream AI App). */
export function ConnectCodeStep({
  branding,
  position,
}: {
  branding: Branding;
  position: { index: string; total: string };
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/modules/updates/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnTo: "/cms-setup/app-updates" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        message?: string;
        error?: string;
      };
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      setError(data.message ?? data.error ?? "GitHub didn't answer. Retry.");
    } catch {
      setError("Couldn't reach the server. Please retry.");
    }
    setBusy(false);
  }

  return (
    <SetupStep
      branding={branding}
      position={position}
      title="Connect your code"
      description="Connect the GitHub repository this app was deployed from, so the starter kit and your modules can keep themselves up to date. You can do this later in Admin › Updates."
      howLong="about a minute"
      next="Next you choose how updates go live."
      actions={
        <>
          <Button
            variant="ghost"
            size="lg"
            onClick={() => window.location.assign("/admin")}
          >
            Skip for now
          </Button>
          <Button
            size="lg"
            className="w-full sm:w-48"
            disabled={busy}
            onClick={() => void connect()}
          >
            {busy ? <Spinner /> : null}
            Connect GitHub
          </Button>
        </>
      }
    >
      <ul className="grid gap-4 min-[760px]:grid-cols-3">
        {POINTS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="rounded-lg border p-4">
            <Icon className="text-muted-foreground mb-3 size-5" aria-hidden />
            <p className="font-medium">{title}</p>
            <p className="text-muted-foreground mt-1 text-sm">{text}</p>
          </li>
        ))}
      </ul>
      {error ? <FieldError>{error}</FieldError> : null}
    </SetupStep>
  );
}

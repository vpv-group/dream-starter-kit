"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import type { Branding } from "~/lib/payload";
import type { ServiceCheck } from "~/lib/setup/services-core";
import { SetupStep } from "~/components/setup/setup-step";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { FieldError } from "~/components/ui/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "~/components/ui/item";
import { Spinner } from "~/components/ui/spinner";

const SUPABASE_ERRORS: Record<string, string> = {
  denied: "Supabase wasn't connected. Try again when you're ready.",
  project_not_found:
    "We couldn't find this app's Supabase project in that organization. Pick the organization that owns it.",
  failed: "Supabase didn't accept the settings. Try again in a minute.",
};

/** Founder step: the host and database checklist, with Fix where we can. */
export function ServicesStep({
  branding,
  position,
  checks,
  supabase,
}: {
  branding: Branding;
  position: { index: string; total: string };
  checks: ServiceCheck[];
  /** ?supabase=… after the Supabase connection returns. */
  supabase: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    supabase && supabase !== "configured"
      ? (SUPABASE_ERRORS[supabase] ?? SUPABASE_ERRORS.failed ?? null)
      : null,
  );

  async function fix() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/modules/updates/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "supabase",
          returnTo: "/cms-setup/services",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        message?: string;
      };
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      setError(data.message ?? "Couldn't start the Supabase connection.");
    } catch {
      setError("Couldn't reach the server. Please retry.");
    }
    setBusy(false);
  }

  return (
    <SetupStep
      branding={branding}
      position={position}
      title="Finish connecting your services"
      description="A few settings live with your host and your database. Anything left here keeps working, but fix it before you invite people. You can come back from Admin › Updates."
      howLong="a few minutes"
      next="Next you land in your admin."
      actions={
        <Button
          size="lg"
          className="w-full sm:w-48"
          onClick={() => window.location.assign("/admin")}
        >
          Continue
        </Button>
      }
    >
      <ItemGroup className="rounded-lg border">
        {checks.map((check, i) => (
          <div key={check.key}>
            {i > 0 ? <ItemSeparator /> : null}
            <Item>
              <ItemMedia>
                {check.status === "done" ? (
                  <Check className="text-primary size-5" aria-hidden />
                ) : (
                  <span
                    className="bg-foreground size-2 rounded-full"
                    aria-hidden
                  />
                )}
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{check.title}</ItemTitle>
                {check.status === "needs-you" ? (
                  <ItemDescription>{check.hint}</ItemDescription>
                ) : null}
              </ItemContent>
              <ItemActions>
                {check.status === "done" ? (
                  <Badge variant="secondary">Done</Badge>
                ) : check.fix ? (
                  <Button size="sm" disabled={busy} onClick={() => void fix()}>
                    {busy ? <Spinner /> : null}
                    Connect Supabase
                  </Button>
                ) : (
                  <Badge variant="outline">Needs you</Badge>
                )}
              </ItemActions>
            </Item>
          </div>
        ))}
      </ItemGroup>
      {error ? <FieldError>{error}</FieldError> : null}
    </SetupStep>
  );
}

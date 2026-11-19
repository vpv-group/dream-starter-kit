import Link from "next/link";

import type { Branding } from "~/lib/payload";
import { WorkspaceMark } from "~/components/invites/workspace-mark";
import {
  OnboardingShell,
  StepHeading,
} from "~/components/onboarding/onboarding-shell";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";

/**
 * Public invite page (wireframe InviteLanding) for signed-out visitors, and
 * the invite-link variant (`/join/[token]`): who invited you, where you're
 * joining, and how to continue.
 */
export function InviteLanding({
  branding,
  workspaceName,
  workspaceUrl,
  logoUrl,
  inviterName,
  role,
  invitedEmail,
  continueHref,
  signInHref,
  allowedDomains,
}: {
  branding: Branding;
  workspaceName: string;
  workspaceUrl: string;
  logoUrl: string | null;
  inviterName: string | null;
  role: string;
  /** Email invites: the address it was sent to. Null for invite links. */
  invitedEmail: string | null;
  continueHref: string;
  signInHref: string;
  allowedDomains?: string[];
}) {
  const roleLabel = role === "admin" ? "an admin" : "a member";
  const description = invitedEmail
    ? `${inviterName ?? "Your team"} invited you to work together. You’ll join as ${roleLabel}.`
    : `Anyone with this link can join as a member.`;

  const preview = (
    <Card className="py-5">
      <CardContent className="flex items-center gap-4 px-5">
        <WorkspaceMark name={workspaceName} logoUrl={logoUrl} />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{workspaceName}</p>
          <p className="text-muted-foreground truncate font-mono text-xs">
            {workspaceUrl}
          </p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <OnboardingShell
      branding={branding}
      preview={preview}
      previewLabel="You’re joining"
      previewCaption={
        inviterName ? `Invited by ${inviterName}.` : "Shared by a team admin."
      }
    >
      <div className="flex flex-1 flex-col gap-6">
        <WorkspaceMark name={workspaceName} logoUrl={logoUrl} />
        <StepHeading
          title={`Join ${workspaceName}`}
          description={description}
        />
        {invitedEmail ? (
          <div className="bg-muted/50 rounded-lg border px-4 py-3">
            <p className="text-muted-foreground text-xs">Invite sent to</p>
            <p className="font-medium">{invitedEmail}</p>
          </div>
        ) : allowedDomains?.length ? (
          <p className="text-muted-foreground text-sm">
            Only people with an{" "}
            {allowedDomains.map((d) => `@${d}`).join(" or ")} email can join
            with it.
          </p>
        ) : null}
        <div className="mt-auto flex flex-col gap-3 min-[760px]:mt-0">
          <Button asChild size="lg" className="w-full">
            <Link href={continueHref}>
              {invitedEmail
                ? `Continue as ${invitedEmail}`
                : "Create an account"}
            </Link>
          </Button>
          <p className="text-muted-foreground text-center text-sm">
            {invitedEmail ? "Not you? " : "Already have an account? "}
            <Link
              href={signInHref}
              className="text-primary underline underline-offset-4"
            >
              {invitedEmail ? "Sign in with another account" : "Sign in"}
            </Link>
          </p>
        </div>
      </div>
    </OnboardingShell>
  );
}

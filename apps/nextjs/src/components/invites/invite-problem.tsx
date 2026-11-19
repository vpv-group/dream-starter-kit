import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import type { InviteProblemKind } from "@acme/app";
import { labelLower } from "@acme/app";

import type { Branding } from "~/lib/payload";
import { SwitchAccountButton } from "~/components/invites/switch-account-button";
import {
  OnboardingShell,
  StepHeading,
} from "~/components/onboarding/onboarding-shell";
import { Alert, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  });
}

/**
 * One screen, different banners (wireframe InviteProblem): expired, revoked,
 * used, unknown, wrong account, link turned off, email domain not allowed.
 */
export function InviteProblem({
  branding,
  kind,
  returnTo,
  workspaceName,
  inviterName,
  invitedEmail,
  signedInEmail,
  expiresAt,
  inviteExpiryDays,
  allowedDomains,
  workspaceLabel,
  canCreateWorkspace,
}: {
  branding: Branding;
  kind: InviteProblemKind;
  /** The invite/join page, for Switch account. */
  returnTo: string;
  workspaceName: string | null;
  inviterName: string | null;
  invitedEmail: string | null;
  signedInEmail: string | null;
  expiresAt: string | null;
  inviteExpiryDays: number;
  allowedDomains?: string[];
  workspaceLabel: string;
  canCreateWorkspace: boolean;
}) {
  const ws = workspaceName ?? `this ${workspaceLabel.toLowerCase()}`;
  const who = inviterName ?? `an admin of ${ws}`;
  const banner: Record<InviteProblemKind, string> = {
    expired: expiresAt
      ? `This invite to ${ws} expired on ${formatDate(expiresAt)}.`
      : `This invite to ${ws} expired.`,
    revoked: "This invite was cancelled.",
    used: "This invite was already used.",
    not_found: "This invite link isn’t valid.",
    wrong_account: invitedEmail
      ? `This invite was sent to ${invitedEmail}.`
      : "This invite was sent to a different address.",
    disabled: "This invite link was turned off.",
    domain: "Your email can’t join with this link.",
  };
  const title: Record<InviteProblemKind, string> = {
    expired: "Ask for a new invite",
    revoked: "Ask for a new invite",
    used: "Already used",
    not_found: "Check the link",
    wrong_account: "Signed in as a different account?",
    disabled: "Ask for a new link",
    domain: "Use your work email",
  };
  const body: Record<InviteProblemKind, string> = {
    expired: `Invites last ${inviteExpiryDays} days. Ask ${who} to send a new one from ${ws}’s member list.${invitedEmail ? ` It will arrive at ${invitedEmail}.` : ""}`,
    revoked: `Ask ${who} to send a new one if you still need access.`,
    used: `If that was you, sign in to open ${ws}.`,
    not_found:
      "The link may be incomplete. Open it from the email again, or ask for a new invite.",
    wrong_account: `Invites only work for the address they were sent to.${invitedEmail ? ` Switch to ${invitedEmail} to use this one.` : ""}${signedInEmail ? ` You're signed in as ${signedInEmail}.` : ""}`,
    disabled: `Ask ${who} for a new invite link or an email invite.`,
    domain: allowedDomains?.length
      ? `Only people with an ${allowedDomains.map((d) => `@${d}`).join(" or ")} email can join with this link.${signedInEmail ? ` You're signed in as ${signedInEmail}.` : ""}`
      : "This link is limited to certain email domains.",
  };

  const showSwitch =
    signedInEmail !== null &&
    (kind === "wrong_account" || kind === "domain" || kind === "used");

  return (
    <OnboardingShell
      branding={branding}
      headerRight={signedInEmail ?? undefined}
    >
      <div className="flex flex-1 flex-col gap-6">
        <Alert>
          <AlertTriangle />
          <AlertTitle>{banner[kind]}</AlertTitle>
        </Alert>
        <StepHeading title={title[kind]} description={body[kind]} />
        <div className="mt-auto flex flex-col gap-3 min-[760px]:mt-0">
          {showSwitch ? <SwitchAccountButton returnTo={returnTo} /> : null}
          {!signedInEmail && kind === "used" ? (
            <Button asChild size="lg" className="w-full">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          ) : null}
          {canCreateWorkspace ? (
            <Button asChild size="lg" variant="secondary" className="w-full">
              <Link href={signedInEmail ? "/onboarding/workspace" : "/sign-up"}>
                Create your own {labelLower(workspaceLabel)}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </OnboardingShell>
  );
}

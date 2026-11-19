"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { PendingInvitation } from "@acme/app";
import {
  labelLower,
  labelWithArticle,
  useAcceptPendingInvitation,
  workspaceErrorMessage,
} from "@acme/app";
import { toast } from "@acme/ui/toast";

import type { Branding } from "~/lib/payload";
import { WorkspaceMark } from "~/components/invites/workspace-mark";
import {
  OnboardingShell,
  StepHeading,
} from "~/components/onboarding/onboarding-shell";
import { Button } from "~/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "~/components/ui/item";
import { Separator } from "~/components/ui/separator";
import { Spinner } from "~/components/ui/spinner";

const ROLE = { owner: "Owner", admin: "Admin", member: "Member" } as const;

/** Plain sign-up with pending invites (wireframe PendingInvites). */
export function PendingInvites({
  branding,
  email,
  invitations,
  workspaceLabel,
}: {
  branding: Branding;
  email: string;
  invitations: PendingInvitation[];
  workspaceLabel: string;
}) {
  const router = useRouter();
  const accept = useAcceptPendingInvitation();
  const [joining, setJoining] = useState<string | null>(null);
  const lower = labelLower(workspaceLabel);

  async function join(invite: PendingInvitation) {
    setJoining(invite.invitationId);
    try {
      await accept.mutateAsync(invite.invitationId);
      router.push("/onboarding/profile");
      router.refresh();
    } catch (error) {
      setJoining(null);
      toast.error(
        workspaceErrorMessage(error as { message?: string }, workspaceLabel),
      );
    }
  }

  return (
    <OnboardingShell branding={branding} headerRight={email}>
      <div className="flex flex-1 flex-col gap-6">
        <StepHeading
          title="You’ve been invited"
          description={`Join ${labelWithArticle(workspaceLabel)} your team already set up, or create your own.`}
        />
        <ItemGroup className="rounded-lg border">
          {invitations.map((invite, i) => (
            <div key={invite.invitationId}>
              {i > 0 ? <Separator /> : null}
              <Item>
                <ItemMedia>
                  <WorkspaceMark
                    name={invite.orgName}
                    logoUrl={invite.logoUrl}
                    className="size-10 text-base"
                  />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{invite.orgName}</ItemTitle>
                  <ItemDescription>
                    {invite.inviterName
                      ? `Invited by ${invite.inviterName} · `
                      : ""}
                    {ROLE[invite.role as keyof typeof ROLE]}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    size="sm"
                    disabled={joining !== null}
                    onClick={() => void join(invite)}
                  >
                    {joining === invite.invitationId ? <Spinner /> : null}
                    Join
                  </Button>
                </ItemActions>
              </Item>
            </div>
          ))}
        </ItemGroup>
        <p className="text-muted-foreground text-sm">
          Only invites sent to {email} appear here. You can join more than one.
        </p>
        <Separator />
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Starting something separate?</p>
          <Button asChild variant="secondary" className="w-fit">
            <Link href="/onboarding/workspace">Create a new {lower}</Link>
          </Button>
        </div>
      </div>
    </OnboardingShell>
  );
}

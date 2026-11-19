"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { InviteResultRow } from "@acme/app";
import { useSaveOnboardingProgress, useSendInvitations } from "@acme/app";
import { toast } from "@acme/ui/toast";

import type { Branding } from "~/lib/payload";
import {
  InviteFields,
  InviteLinkField,
  InviteResults,
  useInviteDraft,
} from "~/components/invites/invite-fields";
import {
  OnboardingShell,
  StepHeading,
} from "~/components/onboarding/onboarding-shell";
import { StepProgress } from "~/components/onboarding/step-progress";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "~/components/ui/item";
import { Spinner } from "~/components/ui/spinner";

/** Welcome step: invite teammates by email or link (wireframe Invite). */
export function InviteStep(props: {
  branding: Branding;
  orgId: string;
  workspaceName: string;
  workspaceLabel: string;
  me: { name: string; email: string };
  allowInviteLinks: boolean;
  allowedDomains: string[];
  inviteExpiryDays: number;
  stepIndex: number;
  stepTotal: number;
  nextStepKey: string | null;
  nextPath: string;
  showProgress: boolean;
}) {
  const router = useRouter();
  const draft = useInviteDraft();
  const send = useSendInvitations(props.orgId);
  const save = useSaveOnboardingProgress();
  const [results, setResults] = useState<InviteResultRow[] | null>(null);
  const [leaving, setLeaving] = useState(false);
  const count = draft.parsed.valid.length;

  async function advance(done: boolean) {
    setLeaving(true);
    try {
      await save.mutateAsync({
        orgId: props.orgId,
        step: props.nextStepKey ?? "invite",
        completed: props.nextStepKey === null && props.showProgress,
        ...(done ? { done: "invite" } : {}),
      });
      router.push(props.nextPath);
    } catch {
      setLeaving(false);
      toast.error("Couldn't save your progress. Please try again.");
    }
  }

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (count === 0) return;
    try {
      const rows = await send.mutateAsync({
        emails: draft.parsed.valid,
        role: draft.role,
      });
      setResults(rows);
      draft.setText("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't send invites.",
      );
    }
  }

  const sentAny = results?.some(
    (r) => r.result === "sent" || r.result === "existing_account",
  );

  const roleWord = draft.role === "admin" ? "Admin" : "Member";
  const preview = (
    <Card className="py-2">
      <CardContent className="px-5">
        <ItemGroup>
          <Item size="sm" className="px-0">
            <ItemMedia>
              <Avatar>
                <AvatarFallback>
                  {(props.me.name || props.me.email).slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{props.me.name || props.me.email}</ItemTitle>
              <ItemDescription>{props.me.email}</ItemDescription>
            </ItemContent>
            <Badge variant="secondary">Owner</Badge>
          </Item>
          {draft.parsed.valid.map((email) => (
            <Item key={email} size="sm" className="border-t px-0">
              <ItemMedia>
                <Avatar>
                  <AvatarFallback>{email[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{email}</ItemTitle>
                <ItemDescription>
                  {roleWord} · invite ready to send
                </ItemDescription>
              </ItemContent>
              <Badge variant="secondary">In progress</Badge>
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  );

  return (
    <OnboardingShell
      branding={props.branding}
      headerRight={props.workspaceName}
      preview={preview}
      previewLabel={`${props.workspaceName} members`}
      previewCaption={`After sending, each shows Waiting on them until they join. Invites last ${props.inviteExpiryDays} days.`}
    >
      <form
        onSubmit={(e) => void onSend(e)}
        className="flex flex-1 flex-col gap-6"
      >
        <StepProgress
          total={props.stepTotal}
          current={props.stepIndex}
          showBar={props.showProgress}
        />
        <StepHeading
          title="Invite your team"
          description={`They’ll get an email with a link to join ${props.workspaceName}.`}
        />
        <InviteFields draft={draft} workspaceLabel={props.workspaceLabel} />
        {results ? <InviteResults results={results} /> : null}
        {props.allowInviteLinks ? (
          <InviteLinkField
            orgId={props.orgId}
            allowedDomains={props.allowedDomains}
          />
        ) : null}
        <div className="mt-auto grid grid-cols-2 gap-3 min-[760px]:mt-0">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            disabled={leaving}
            onClick={() => void advance(Boolean(sentAny))}
          >
            {sentAny ? "Continue" : "Do this later"}
          </Button>
          <Button
            type="submit"
            size="lg"
            disabled={count === 0 || send.isPending || leaving}
          >
            {send.isPending ? <Spinner /> : null}
            {count > 1 ? `Send ${count} invitations` : "Send invitation"}
          </Button>
        </div>
      </form>
    </OnboardingShell>
  );
}

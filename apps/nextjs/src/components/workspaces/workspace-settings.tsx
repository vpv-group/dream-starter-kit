"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";

import type { InviteResultRow, WorkspaceMember } from "@acme/app";
import {
  labelLower,
  parseAllowedDomains,
  useRemoveMember,
  useResendInvitation,
  useRevokeInvitation,
  useSendInvitations,
  useSetJoinLink,
  useUpdateMemberRole,
  useWorkspaceInvitations,
  useWorkspaceMembers,
  workspaceErrorMessage,
} from "@acme/app";
import { toast } from "@acme/ui/toast";

import {
  InviteFields,
  InviteLinkField,
  InviteResults,
  useInviteDraft,
} from "~/components/invites/invite-fields";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "~/components/ui/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { Spinner } from "~/components/ui/spinner";
import { Switch } from "~/components/ui/switch";

type Role = WorkspaceMember["role"];
const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

function initials(m: WorkspaceMember): string {
  const source = m.displayName?.trim() || m.email || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  return (
    parts.length > 1
      ? `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`
      : source.slice(0, 2)
  ).toUpperCase();
}

/** Settings → Members: invite, invite link, members, pending invitations. */
export function WorkspaceSettings(props: {
  orgId: string;
  workspaceName: string;
  workspaceSlug: string;
  myRole: Role;
  workspaceLabel: string;
  urlPrefix: string;
  allowInviteLinks: boolean;
  inviteExpiryDays: number;
  joinLink: { enabled: boolean; exists: boolean; allowedDomains: string[] };
}) {
  const isAdmin = props.myRole !== "member";
  const lower = labelLower(props.workspaceLabel);

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {props.workspaceName}
        </h1>
        <p className="text-muted-foreground font-mono text-sm">
          {props.urlPrefix}
          {props.workspaceSlug}
        </p>
      </div>
      {isAdmin ? (
        <InviteCard
          orgId={props.orgId}
          workspaceLabel={props.workspaceLabel}
          inviteExpiryDays={props.inviteExpiryDays}
        />
      ) : null}
      {isAdmin && props.allowInviteLinks ? (
        <InviteLinkCard orgId={props.orgId} joinLink={props.joinLink} />
      ) : null}
      <MembersCard
        orgId={props.orgId}
        myRole={props.myRole}
        lower={lower}
        workspaceLabel={props.workspaceLabel}
      />
      {isAdmin ? (
        <PendingCard
          orgId={props.orgId}
          workspaceLabel={props.workspaceLabel}
        />
      ) : null}
    </div>
  );
}

function InviteCard({
  orgId,
  workspaceLabel,
  inviteExpiryDays,
}: {
  orgId: string;
  workspaceLabel: string;
  inviteExpiryDays: number;
}) {
  const draft = useInviteDraft();
  const send = useSendInvitations(orgId);
  const [results, setResults] = useState<InviteResultRow[] | null>(null);
  const count = draft.parsed.valid.length;

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    try {
      setResults(
        await send.mutateAsync({
          emails: draft.parsed.valid,
          role: draft.role,
        }),
      );
      draft.setText("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't send invites.",
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite people</CardTitle>
        <CardDescription>
          They’ll get an email with a link to join. Invites last{" "}
          {inviteExpiryDays} days.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => void onSend(e)}
          className="flex max-w-xl flex-col gap-4"
        >
          <InviteFields draft={draft} workspaceLabel={workspaceLabel} />
          {results ? <InviteResults results={results} /> : null}
          <Button
            type="submit"
            className="w-fit"
            disabled={count === 0 || send.isPending}
          >
            {send.isPending ? <Spinner /> : null}
            {count > 1 ? `Send ${count} invitations` : "Send invitation"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function InviteLinkCard({
  orgId,
  joinLink,
}: {
  orgId: string;
  joinLink: { enabled: boolean; exists: boolean; allowedDomains: string[] };
}) {
  const setLink = useSetJoinLink(orgId);
  const [enabled, setEnabled] = useState(joinLink.enabled);
  const [domains, setDomains] = useState(joinLink.allowedDomains.join(", "));
  const [saved, setSaved] = useState(joinLink.allowedDomains);
  const [domainError, setDomainError] = useState<string | null>(null);

  async function save(nextEnabled: boolean) {
    const parsed = parseAllowedDomains(domains);
    if (!parsed.ok) {
      setDomainError(parsed.error);
      return;
    }
    setDomainError(null);
    try {
      await setLink.mutateAsync({
        enabled: nextEnabled,
        allowedDomains: parsed.domains,
      });
      setEnabled(nextEnabled);
      setSaved(parsed.domains);
      toast.success("Invite link updated");
    } catch (error) {
      toast.error(workspaceErrorMessage(error as { message?: string }));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite link</CardTitle>
        <CardDescription>
          A link anyone can use to join as a member. Turn it off or create a new
          one at any time.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex max-w-xl flex-col gap-5">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="join-link-enabled">Link is on</FieldLabel>
            <FieldDescription>
              {joinLink.exists
                ? "People with the link can join."
                : "Create a link below to start sharing."}
            </FieldDescription>
          </FieldContent>
          <Switch
            id="join-link-enabled"
            checked={enabled}
            disabled={setLink.isPending}
            onCheckedChange={(v) => void save(v)}
          />
        </Field>
        <Field data-invalid={domainError ? true : undefined}>
          <FieldLabel htmlFor="join-link-domains">
            Allowed email domains
          </FieldLabel>
          <div className="flex gap-2">
            <Input
              id="join-link-domains"
              placeholder="company.com"
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              aria-invalid={domainError ? true : undefined}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={setLink.isPending}
              onClick={() => void save(enabled)}
            >
              Save
            </Button>
          </div>
          <FieldDescription
            className={domainError ? "text-destructive" : undefined}
          >
            {domainError ??
              "Optional. Leave empty to let anyone with the link join. Free email providers aren’t allowed."}
          </FieldDescription>
        </Field>
        <Separator />
        <InviteLinkField orgId={orgId} allowedDomains={saved} />
      </CardContent>
    </Card>
  );
}

function MembersCard({
  orgId,
  myRole,
  lower,
  workspaceLabel,
}: {
  orgId: string;
  myRole: Role;
  lower: string;
  workspaceLabel: string;
}) {
  const members = useWorkspaceMembers(orgId);
  const updateRole = useUpdateMemberRole(orgId);
  const remove = useRemoveMember(orgId);
  const [removing, setRemoving] = useState<WorkspaceMember | null>(null);
  const isAdmin = myRole !== "member";
  const isOwner = myRole === "owner";

  async function changeRole(member: WorkspaceMember, role: Role) {
    try {
      await updateRole.mutateAsync({ userId: member.userId, role });
      toast.success(
        `${member.displayName ?? member.email} is now ${ROLE_LABEL[role].toLowerCase()}`,
      );
    } catch (error) {
      toast.error(roleError(error, workspaceLabel));
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    try {
      await remove.mutateAsync(removing.userId);
      toast.success(`Removed ${removing.displayName ?? removing.email}`);
      setRemoving(null);
    } catch (error) {
      toast.error(roleError(error, workspaceLabel));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>
          Everyone in this {lower}. Owners and admins can invite people and
          change roles; only owners can make someone an owner.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {members.isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <ItemGroup>
            {(members.data ?? []).map((m, i) => {
              const canEdit =
                isAdmin && !m.isYou && (m.role !== "owner" || isOwner);
              return (
                <div key={m.userId}>
                  {i > 0 ? <Separator /> : null}
                  <Item size="sm" className="px-0">
                    <ItemMedia>
                      <Avatar>
                        {m.avatarUrl ? (
                          <AvatarImage src={m.avatarUrl} alt="" />
                        ) : null}
                        <AvatarFallback>{initials(m)}</AvatarFallback>
                      </Avatar>
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>
                        {m.displayName ?? m.email}
                        {m.isYou ? <Badge variant="outline">You</Badge> : null}
                      </ItemTitle>
                      <ItemDescription>
                        {[m.email, m.title].filter(Boolean).join(" · ")}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      {canEdit ? (
                        <Select
                          value={m.role}
                          onValueChange={(v) => void changeRole(m, v as Role)}
                        >
                          <SelectTrigger
                            size="sm"
                            className="w-28"
                            aria-label={`Role for ${m.displayName ?? m.email}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {isOwner ? (
                              <SelectItem value="owner">Owner</SelectItem>
                            ) : null}
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="secondary">{ROLE_LABEL[m.role]}</Badge>
                      )}
                      {canEdit ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`More for ${m.displayName ?? m.email}`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => setRemoving(m)}
                            >
                              Remove from {lower}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </ItemActions>
                  </Item>
                </div>
              );
            })}
          </ItemGroup>
        )}
      </CardContent>
      <Dialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Remove {removing?.displayName ?? removing?.email}?
            </DialogTitle>
            <DialogDescription>
              They lose access to this {lower} right away. You can invite them
              again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => void confirmRemove()}
            >
              {remove.isPending ? <Spinner /> : null}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function roleError(error: unknown, workspaceLabel: string): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "owners_only")
    return "Only owners can change the owner role.";
  return workspaceErrorMessage({ message }, workspaceLabel);
}

function PendingCard({
  orgId,
  workspaceLabel,
}: {
  orgId: string;
  workspaceLabel: string;
}) {
  const invitations = useWorkspaceInvitations(orgId);
  const resend = useResendInvitation(orgId);
  const revoke = useRevokeInvitation(orgId);
  const rows = invitations.data ?? [];

  async function onResend(id: string, email: string) {
    try {
      const res = await resend.mutateAsync(id);
      if (res.result === "existing_account" && res.link) {
        await navigator.clipboard.writeText(res.link).catch(() => undefined);
        toast.success(`${email} has an account — new invite link copied`);
      } else if (res.result === "sent") {
        toast.success(`Invite sent again to ${email}`);
      } else {
        toast.error(`Couldn't email ${email}`);
      }
    } catch (error) {
      toast.error(
        workspaceErrorMessage(error as { message?: string }, workspaceLabel),
      );
    }
  }

  async function onRevoke(id: string, email: string) {
    try {
      await revoke.mutateAsync(id);
      toast.success(`Invite to ${email} cancelled`);
    } catch (error) {
      toast.error(
        workspaceErrorMessage(error as { message?: string }, workspaceLabel),
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending invitations</CardTitle>
        <CardDescription>Waiting on them until they join.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No pending invitations.
          </p>
        ) : (
          <ItemGroup>
            {rows.map((inv, i) => (
              <div key={inv.id}>
                {i > 0 ? <Separator /> : null}
                <Item size="sm" className="px-0">
                  <ItemContent>
                    <ItemTitle>{inv.email}</ItemTitle>
                    <ItemDescription>
                      {ROLE_LABEL[inv.role as Role]}
                      {inv.expiresAt
                        ? ` · expires ${new Date(inv.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                        : ""}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={resend.isPending}
                      onClick={() => void onResend(inv.id, inv.email)}
                    >
                      Resend
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={revoke.isPending}
                      onClick={() => void onRevoke(inv.id, inv.email)}
                    >
                      Revoke
                    </Button>
                  </ItemActions>
                </Item>
              </div>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}

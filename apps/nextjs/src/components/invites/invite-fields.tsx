"use client";

import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";

import type { InviteResult, InviteResultRow } from "@acme/app";
import {
  inviteResultLabel,
  labelLower,
  parseEmailList,
  useResetJoinLink,
} from "@acme/app";
import { toast } from "@acme/ui/toast";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "~/components/ui/input-group";
import {
  Item,
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
import { Spinner } from "~/components/ui/spinner";
import { Textarea } from "~/components/ui/textarea";

export type InviteRole = "member" | "admin";

/** Emails + role draft shared by the Invite step and Settings → Members. */
export function useInviteDraft() {
  const [text, setText] = useState("");
  const [role, setRole] = useState<InviteRole>("member");
  const parsed = parseEmailList(text);
  return { text, setText, role, setRole, parsed };
}

/** Email addresses textarea + role select (wireframe Invite). */
export function InviteFields({
  draft,
  workspaceLabel,
}: {
  draft: ReturnType<typeof useInviteDraft>;
  workspaceLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1fr_8rem] items-start gap-3">
        <Field>
          <FieldLabel htmlFor="invite-emails">Email addresses</FieldLabel>
          <Textarea
            id="invite-emails"
            rows={3}
            placeholder="ana@company.com, sam@company.com"
            value={draft.text}
            onChange={(e) => draft.setText(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="invite-role">Role</FieldLabel>
          <Select
            value={draft.role}
            onValueChange={(v) => draft.setRole(v as InviteRole)}
          >
            <SelectTrigger id="invite-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <FieldDescription>
        Separate with commas or new lines. Admins can invite people and manage
        the {labelLower(workspaceLabel)}.
      </FieldDescription>
      {draft.parsed.invalid.length > 0 ? (
        <p className="text-destructive text-sm">
          Not valid: {draft.parsed.invalid.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

const STATUS: Record<
  InviteResult,
  { word: string; tone: "done" | "wait" | "fix" }
> = {
  sent: { word: "Waiting on them", tone: "wait" },
  existing_account: { word: "Waiting on them", tone: "wait" },
  already_member: { word: "Done", tone: "done" },
  invalid: { word: "Needs a fix", tone: "fix" },
  rate_limited: { word: "Needs a fix", tone: "fix" },
  send_failed: { word: "Needs a fix", tone: "fix" },
};

/** What happened to each address after sending. */
export function InviteResults({ results }: { results: InviteResultRow[] }) {
  if (results.length === 0) return null;
  return (
    <ItemGroup className="rounded-lg border">
      {results.map((r) => (
        <Item key={r.email} size="sm">
          <ItemMedia>
            <span className="bg-muted flex size-8 items-center justify-center rounded-full text-xs font-medium uppercase">
              {r.email[0]}
            </span>
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{r.email}</ItemTitle>
            <ItemDescription>{inviteResultLabel(r.result)}</ItemDescription>
            {r.link ? (
              <CopyText value={r.link} label="Copy their invite link" />
            ) : null}
          </ItemContent>
          <Badge
            variant={
              STATUS[r.result].tone === "fix" ? "destructive" : "secondary"
            }
            className={
              STATUS[r.result].tone === "done" ? "text-primary" : undefined
            }
          >
            {STATUS[r.result].word}
          </Badge>
        </Item>
      ))}
    </ItemGroup>
  );
}

function CopyText({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      className="text-primary mt-1 w-fit text-xs underline underline-offset-4"
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => toast.success("Link copied"));
      }}
    >
      {label}
    </button>
  );
}

/**
 * "Or share an invite link": the plaintext link exists only right after it is
 * created or rotated (only its hash is stored), so this offers Create / New
 * link and then shows it with a copy button.
 */
export function InviteLinkField({
  orgId,
  allowedDomains,
}: {
  orgId: string;
  allowedDomains: string[];
}) {
  const reset = useResetJoinLink(orgId);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    try {
      setLink(await reset.mutateAsync());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create a link.");
    }
  }

  return (
    <Field>
      <FieldLabel htmlFor="invite-link">Or share an invite link</FieldLabel>
      {link ? (
        <InputGroup>
          <InputGroupInput
            id="invite-link"
            readOnly
            value={link}
            className="font-mono text-xs"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(link).then(() => {
                  setCopied(true);
                  toast.success("Link copied");
                });
              }}
            >
              {copied ? <Check /> : <Copy />}
              Copy link
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={reset.isPending}
          onClick={() => void create()}
        >
          {reset.isPending ? <Spinner /> : <Link2 />}
          Create invite link
        </Button>
      )}
      <FieldDescription>
        {allowedDomains.length > 0
          ? `Only people with an ${allowedDomains.map((d) => `@${d}`).join(" or ")} email can join with it.`
          : "Anyone with the link can join as a member. Creating a new link turns off the old one."}
      </FieldDescription>
    </Field>
  );
}

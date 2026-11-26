"use client";

import { useState } from "react";
import { IconExternalLink, IconLifebuoy } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, AlertDescription, AlertTitle } from "@acme/ui/alert";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acme/ui/card";
import { Input } from "@acme/ui/input";
import { Label } from "@acme/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@acme/ui/select";
import { toast } from "@acme/ui/toast";

import type { BillingAccount } from "./account-switcher";
import { usePlans } from "../index";
import { InvoiceList } from "./invoice-list";

/**
 * Staff billing support: a READ-ONLY view of any person's or workspace's
 * billing — what they're entitled to, every purchase (paid or granted),
 * invoices and the provider customer — plus the one thing staff may change:
 * no-charge plan grants (grant, extend, revoke). Paid subscriptions stay
 * managed in the provider (the customer link opens its dashboard). Every
 * view and change is written to the audit log by the server.
 */

interface Purchase {
  id: string;
  planName: string | null;
  provider: string;
  store: string;
  kind: string;
  status: string;
  entitlement: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  createdAt: string;
  note: string | null;
  planId: string | null;
  isGrant: boolean;
}

interface AccountView {
  subject:
    | { kind: "user"; id: string; email: string | null; name: string | null }
    | {
        kind: "org";
        id: string;
        name: string;
        slug: string | null;
        owner: { id: string; email: string | null; name: string | null } | null;
        members: number;
      };
  workspaces: { id: string; name: string; role: string }[];
  isPremium: boolean;
  purchases: Purchase[];
  invoices: Parameters<typeof InvoiceList>[0]["invoices"];
  customers: {
    provider: string;
    label: string;
    customerId: string;
    dashboardUrl: string | null;
  }[];
}

const API = "/api/mod/billing/admin";

async function post(path: string, body: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString() : null;

function statusBadge(p: Purchase) {
  if (p.status === "active" && p.cancelAtPeriodEnd)
    return <Badge variant="outline">Canceling</Badge>;
  const live = p.status === "active" || p.status === "trialing";
  return (
    <Badge variant={live ? "default" : "secondary"}>
      {p.status.replace(/_/g, " ")}
    </Badge>
  );
}

/** The workspace / account the view is about, as a request subject. */
function subjectOf(a: Exclude<BillingAccount, { kind: "me" }>) {
  return a.kind === "org" ? { orgId: a.id } : { userId: a.id };
}

function GrantForm({
  account,
  grant,
  onDone,
}: {
  account: Exclude<BillingAccount, { kind: "me" }>;
  /** Extending an existing grant. */
  grant?: Purchase;
  onDone: () => void;
}) {
  const plans = usePlans();
  const planList = plans.data ?? [];
  const [planId, setPlanId] = useState<string>(
    grant?.planId ? String(grant.planId) : "",
  );
  const [until, setUntil] = useState<string>(
    grant?.currentPeriodEnd ? grant.currentPeriodEnd.slice(0, 10) : "",
  );
  const [note, setNote] = useState(grant?.note ?? "");
  // Earliest end date: tomorrow (computed once, not on every render).
  const [tomorrow] = useState(() =>
    new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
  );
  const mutation = useMutation({
    mutationFn: () =>
      post("/grant", {
        subject: subjectOf(account),
        planId: planId || planList[0]?.id,
        // End of the chosen day, local time.
        expiresAt: until ? new Date(`${until}T23:59:59`).toISOString() : null,
        note: note || null,
        ...(grant ? { grantId: grant.id } : {}),
      }),
    onSuccess: () => {
      toast.success(grant ? "Grant updated" : "Plan granted");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_10rem]"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="grant-plan">Plan</Label>
        <Select
          value={planId || String(planList[0]?.id ?? "")}
          disabled={planList.length === 0}
          onValueChange={setPlanId}
        >
          <SelectTrigger id="grant-plan">
            <SelectValue placeholder="Choose a plan" />
          </SelectTrigger>
          <SelectContent>
            {planList.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="grant-until">Until (optional)</Label>
        <Input
          id="grant-until"
          type="date"
          value={until}
          min={tomorrow}
          onChange={(e) => setUntil(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="grant-note">Why (shown to staff only)</Label>
        <Input
          id="grant-note"
          value={note}
          maxLength={500}
          placeholder="e.g. Partner account, support credit for the March outage"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      {!plans.isLoading && planList.length === 0 && (
        <p className="text-muted-foreground text-sm sm:col-span-2">
          No active plans yet — add one under Commerce → Billing Plans.
        </p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button
          type="submit"
          disabled={mutation.isPending || planList.length === 0}
        >
          {mutation.isPending
            ? "Saving…"
            : grant
              ? "Update grant"
              : "Grant plan (no charge)"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const accountKey = (a: Exclude<BillingAccount, { kind: "me" }>) => [
  "billing-admin-account",
  a.kind,
  a.id,
];

/** The staff view of one account (shared by the page header and the view). */
export function useSupportAccount(
  account: Exclude<BillingAccount, { kind: "me" }> | null,
) {
  return useQuery({
    queryKey: account ? accountKey(account) : ["billing-admin-account", "none"],
    enabled: account !== null,
    queryFn: async (): Promise<AccountView> => {
      if (!account) throw new Error("No account");
      const res = await fetch(
        `${API}/account?${account.kind === "org" ? "org" : "user"}=${account.id}`,
      );
      const data = (await res.json().catch(() => ({}))) as AccountView & {
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not load the account");
      return data;
    },
  });
}

/** "Acme Corp" / "Dana Whitfield" for the switcher, once loaded. */
export function supportLabel(v: AccountView | undefined): string | null {
  if (!v) return null;
  return v.subject.kind === "org"
    ? v.subject.name
    : (v.subject.name ?? v.subject.email);
}

export function SupportView({
  account,
  onOpen,
}: {
  account: Exclude<BillingAccount, { kind: "me" }>;
  /** Jump to another account (e.g. one of a person's workspaces). */
  onOpen: (a: BillingAccount) => void;
}) {
  const qc = useQueryClient();
  const key = accountKey(account);
  const view = useSupportAccount(account);
  const [editing, setEditing] = useState<Purchase | "new" | null>(null);
  const revoke = useMutation({
    mutationFn: (grantId: string) => post("/revoke", { grantId }),
    onSuccess: () => {
      toast.success("Grant revoked");
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  const done = () => {
    setEditing(null);
    void qc.invalidateQueries({ queryKey: key });
  };

  if (view.isLoading) {
    return <p className="text-muted-foreground text-sm">Loading account…</p>;
  }
  if (view.error || !view.data) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn’t open this account</AlertTitle>
        <AlertDescription>
          {view.error instanceof Error ? view.error.message : "Unknown error"}
        </AlertDescription>
      </Alert>
    );
  }
  const v = view.data;
  const active = v.purchases.filter(
    (p) => p.status === "active" || p.status === "trialing",
  );

  return (
    <div className="flex flex-col gap-6">
      <Alert>
        <IconLifebuoy className="size-4" />
        <AlertTitle>Staff view — read-only</AlertTitle>
        <AlertDescription>
          You’re seeing this{" "}
          {v.subject.kind === "org" ? "workspace" : "account"}
          ’s billing as staff. Paid subscriptions are managed in the payment
          provider; here you can only grant, extend or revoke no-charge plans.
          Views and changes are audited.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardDescription>
            {v.subject.kind === "org" ? "Workspace" : "Account"}
          </CardDescription>
          <CardTitle className="text-xl">
            {v.subject.kind === "org"
              ? v.subject.name
              : (v.subject.name ?? v.subject.email ?? v.subject.id)}
          </CardTitle>
          <CardDescription>
            {v.subject.kind === "org"
              ? `${v.subject.members} member${v.subject.members === 1 ? "" : "s"}${
                  v.subject.owner
                    ? ` · owner ${v.subject.owner.email ?? v.subject.owner.name ?? ""}`
                    : ""
                }`
              : v.subject.email}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Current plan:</span>
            {active.length === 0 ? (
              <Badge variant="secondary">Free</Badge>
            ) : (
              active.map((p) => (
                <Badge key={p.id}>
                  {p.planName ?? "Plan"}
                  {p.isGrant ? " (granted)" : ""}
                </Badge>
              ))
            )}
          </div>
          {v.customers.map((c) => (
            <div key={c.provider} className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">{c.label} customer:</span>
              <code>{c.customerId}</code>
              {c.dashboardUrl && (
                <a
                  href={c.dashboardUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary inline-flex items-center gap-1 underline"
                >
                  Open in {c.label}
                  <IconExternalLink className="size-3.5" />
                </a>
              )}
            </div>
          ))}
          {v.workspaces.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Workspaces:</span>
              {v.workspaces.map((w) => (
                <Button
                  key={w.id}
                  size="sm"
                  variant="outline"
                  onClick={() => onOpen({ kind: "org", id: w.id })}
                >
                  {w.name} · {w.role}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="text-base">Plans and purchases</CardTitle>
            <CardDescription>
              Everything this{" "}
              {v.subject.kind === "org" ? "workspace" : "account"} bought or was
              granted, newest first.
            </CardDescription>
          </div>
          {editing === null && (
            <Button size="sm" onClick={() => setEditing("new")}>
              Grant a plan
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {editing === "new" && <GrantForm account={account} onDone={done} />}
          {v.purchases.length === 0 ? (
            <p className="text-muted-foreground text-sm">No purchases yet.</p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {v.purchases.map((p) => (
                <li key={p.id} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {p.planName ?? "Plan"}
                      </span>
                      <span className="text-muted-foreground">
                        {p.isGrant ? "Granted by staff" : p.provider}
                        {p.store !== "web" && !p.isGrant ? ` · ${p.store}` : ""}
                        {" · since "}
                        {day(p.createdAt)}
                        {p.currentPeriodEnd
                          ? ` · ${p.isGrant ? "until" : "renews/ends"} ${day(p.currentPeriodEnd)}`
                          : p.isGrant
                            ? " · no end date"
                            : ""}
                      </span>
                      {p.note && (
                        <span className="text-muted-foreground italic">
                          “{p.note}”
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {statusBadge(p)}
                      {p.isGrant &&
                        (p.status === "active" || p.status === "trialing") && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditing(p)}
                            >
                              Extend
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={revoke.isPending}
                              onClick={() => revoke.mutate(p.id)}
                            >
                              Revoke
                            </Button>
                          </>
                        )}
                    </div>
                  </div>
                  {editing !== null &&
                    editing !== "new" &&
                    editing.id === p.id && (
                      <GrantForm account={account} grant={p} onDone={done} />
                    )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoices</CardTitle>
          <CardDescription>From every payment provider.</CardDescription>
        </CardHeader>
        <CardContent>
          <InvoiceList invoices={v.invoices} loading={false} />
        </CardContent>
      </Card>
    </div>
  );
}

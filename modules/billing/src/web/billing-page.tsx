"use client";

import { useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { useSession, useSupabase } from "@acme/api";
import { useMyWorkspaces } from "@acme/app";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acme/ui/card";

import type { BillingAccount } from "./account-switcher";
import type { Invoice } from "./invoice-list";
import {
  accountParam,
  AccountSwitcher,
  parseAccount,
} from "./account-switcher";
import { InvoiceList } from "./invoice-list";
import { ManageBillingButton } from "./manage-billing-button";
import { supportLabel, SupportView, useSupportAccount } from "./support-view";

/** Resolve a price's plan display name (price → product). */
function usePlanName(priceId: string | null | undefined) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["plan-name", priceId],
    enabled: !!priceId,
    queryFn: async () => {
      if (!priceId) return null;
      const { data: price } = await supabase
        .from("mod_billing_prices")
        .select("product_id")
        .eq("id", priceId)
        .maybeSingle();
      if (!price?.product_id) return null;
      const { data: product } = await supabase
        .from("mod_billing_products")
        .select("name")
        .eq("id", price.product_id)
        .maybeSingle();
      return product?.name ?? null;
    },
  });
}

/**
 * The active entitlement of the viewer's own account (personal purchases)
 * or of a workspace they belong to — read under RLS.
 */
function useEntitlement(orgId: string | null) {
  const supabase = useSupabase();
  const { user } = useSession();
  return useQuery({
    queryKey: ["billing-entitlement", user?.id, orgId],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return null;
      let q = supabase
        .from("mod_billing_entitlements")
        .select(
          "status, price_id, provider, store, expires_at, cancel_at_period_end",
        )
        .order("expires_at", { ascending: false, nullsFirst: true })
        .limit(1);
      q = orgId
        ? q.eq("org_id", orgId)
        : q.eq("user_id", user.id).is("org_id", null);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function useInvoices(orgId: string | null) {
  return useQuery({
    queryKey: ["invoices", orgId],
    queryFn: async (): Promise<Invoice[]> => {
      const res = await fetch(
        `/api/mod/billing/invoices${orgId ? `?org=${orgId}` : ""}`,
      );
      if (!res.ok) return [];
      const data = (await res.json()) as { invoices?: Invoice[] };
      return data.invoices ?? [];
    },
  });
}

function useIsStaff() {
  const supabase = useSupabase();
  const { user } = useSession();
  return useQuery({
    queryKey: ["is-staff", user?.id],
    enabled: !!user && !user.is_anonymous,
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("profiles")
        .select("is_staff")
        .eq("id", user.id)
        .maybeSingle();
      return data?.is_staff === true;
    },
  });
}

/** Your own billing, or a workspace you administer. */
function OwnBilling({ orgId }: { orgId: string | null }) {
  const entitlement = useEntitlement(orgId);
  const planName = usePlanName(entitlement.data?.price_id);
  const invoices = useInvoices(orgId);
  const sub = entitlement.data;
  const pricing = orgId ? `/pricing?workspace=${orgId}` : "/pricing";

  return (
    <>
      <Card>
        <CardHeader>
          <CardDescription>
            {orgId ? "Workspace plan — every member gets it" : "Current plan"}
          </CardDescription>
          <CardTitle className="text-xl">
            {entitlement.isLoading
              ? "—"
              : sub
                ? (planName.data ?? "Pro")
                : "Free"}
          </CardTitle>
          {sub?.status ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="w-fit">
                {sub.cancel_at_period_end ? "canceling" : sub.status}
              </Badge>
              {sub.store === "promotional" && (
                <Badge variant="outline" className="w-fit">
                  Complimentary
                  {sub.expires_at
                    ? ` until ${new Date(sub.expires_at).toLocaleDateString()}`
                    : ""}
                </Badge>
              )}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {sub && sub.store !== "promotional" ? (
            <ManageBillingButton
              label="Change or cancel plan"
              {...(orgId ? { orgId } : {})}
            />
          ) : (
            <Button asChild>
              <Link href={pricing}>Upgrade</Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={pricing}>View plans</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoices</CardTitle>
          <CardDescription>
            {orgId ? "The workspace's past payments." : "Your past payments."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InvoiceList invoices={invoices.data} loading={invoices.isLoading} />
        </CardContent>
      </Card>
    </>
  );
}

/**
 * /billing — "Billing account for …" with a switcher: your personal billing,
 * the workspaces you administer (company plans every member gets), and — for
 * staff — any person or workspace in a read-only support view with plan
 * grants. The choice lives in `?account=` (`org:<id>` / `user:<id>`).
 */
export function BillingPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { user } = useSession();
  const workspaces = useMyWorkspaces();
  const isStaff = useIsStaff().data === true;

  const account = parseAccount(params.get("account"));
  const select = useCallback(
    (a: BillingAccount) => {
      const next = new URLSearchParams(params.toString());
      const value = accountParam(a);
      if (value) next.set("account", value);
      else next.delete("account");
      next.delete("checkout");
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [params, pathname, router],
  );

  const mine = workspaces.data ?? [];
  const administered =
    account.kind === "org"
      ? mine.find((w) => w.id === account.id && w.role !== "member")
      : undefined;
  // Own billing: personal, or a workspace you administer. Anything else is the
  // staff support view (the server refuses non-staff).
  const supportAccount =
    account.kind !== "me" && !administered ? account : null;
  const support = useSupportAccount(isStaff ? supportAccount : null);

  const label =
    account.kind === "me"
      ? (user?.email ?? "Personal")
      : administered
        ? administered.name
        : `${supportLabel(support.data) ?? (account.kind === "org" ? "Workspace" : "Account")} (staff view)`;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Billing</h1>
        <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
          <span>Billing account for</span>
          <AccountSwitcher
            current={account}
            label={label}
            email={user?.email ?? null}
            workspaces={mine}
            isStaff={isStaff}
            onSelect={select}
          />
        </div>
      </div>

      {supportAccount ? (
        isStaff ? (
          <SupportView account={supportAccount} onOpen={select} />
        ) : (
          <p className="text-muted-foreground text-sm">
            You don’t manage billing for this account.
          </p>
        )
      ) : (
        <OwnBilling orgId={administered?.id ?? null} />
      )}
    </div>
  );
}

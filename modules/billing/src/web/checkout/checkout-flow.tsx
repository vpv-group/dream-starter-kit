"use client";

// The Bloomberg-style two-step checkout, rendered inline on /checkout.
//
// Step 1 (Account) embeds the shared AuthFlow (passwordless email→code, or
// Continue with Apple/Google). It's *account-first*: by the time the buyer
// reaches Step 2 they're signed in, so the payment intent stamps their
// supabase_user_id directly (the anon/guest path stays only as a webhook
// fallback). Step 2 (Payment) mounts the payment provider's inline form. A gated stepper
// built from shadcn Cards: the future step is disabled until the prior is done,
// and the Account step collapses to a ✓ + email + edit affordance once complete.
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil } from "lucide-react";

import type { AuthSettings } from "@acme/app";
import type { ModBillingPlan } from "@acme/cms";
import { useSession, useSupabase } from "@acme/api";
import { isAnonymousUser, signOut } from "@acme/app";
import { HostComponent } from "@acme/mod-kit/react";
import { Button } from "@acme/ui/button";
import { Card, CardContent, CardHeader } from "@acme/ui/card";

import type { PaidResult, PurchaseRef } from "../paywall/payment-provider";
import type { CheckoutTestimonialData } from "./checkout-testimonial";
import { buildPlanCopy, buildUpsellCopy } from "../../paywall-copy";
import { useWebPaymentProvider } from "../paywall/payment-provider";
import { CheckoutPayment } from "./checkout-payment";
import { CheckoutTestimonial } from "./checkout-testimonial";
import { PlanSummary } from "./plan-summary";

/**
 * The host's sign-in/sign-up flow (registered as host component "auth-flow",
 * docs/MODULES.md → Host components). The props billing passes.
 */
export interface CheckoutAuthProps {
  mode: "signIn";
  settings: AuthSettings;
  appName: string;
  onAuthenticated: () => void;
  redirectTo: string;
}

function StepBadge({ n, done }: { n: number; done?: boolean }) {
  return (
    <span
      className={`flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
        done
          ? "bg-primary text-primary-foreground"
          : "bg-foreground text-background"
      }`}
    >
      {done ? <Check className="size-4" /> : n}
    </span>
  );
}

export function CheckoutFlow({
  planId,
  plan,
  annualPlan,
  authSettings,
  appName,
  testimonial,
  workspace,
}: {
  planId: string | number;
  plan: ModBillingPlan;
  annualPlan?: ModBillingPlan | null;
  authSettings: AuthSettings;
  appName: string;
  testimonial?: CheckoutTestimonialData | null;
  /** Buying for this workspace (company billing) rather than personally. */
  workspace?: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const supabase = useSupabase();
  const provider = useWebPaymentProvider();
  const { user } = useSession();

  // Authenticated-and-permanent gates Step 2. `justAuthed` advances immediately
  // when AuthFlow completes client-side (before the session hook re-reads);
  // `editingAccount` lets the buyer go back and switch accounts.
  const [justAuthed, setJustAuthed] = useState(false);
  const [editingAccount, setEditingAccount] = useState(false);
  const isAuthed = Boolean(user && !isAnonymousUser(user));
  const accountDone = (isAuthed || justAuthed) && !editingAccount;

  const [paid, setPaid] = useState(false);
  const [showUpsell, setShowUpsell] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const purchaseRef = useRef<PurchaseRef>({});

  const copy = buildPlanCopy(plan);
  const canUpsell = Boolean(annualPlan?.id && annualPlan.id !== planId);
  const upsellCopy =
    annualPlan && canUpsell ? buildUpsellCopy(annualPlan, plan) : null;

  const finishToApp = useCallback(() => {
    router.push(
      workspace
        ? `/billing?account=org:${workspace.id}&checkout=success`
        : "/a?checkout=success",
    );
  }, [router, workspace]);

  const onPaid = useCallback((result: PaidResult) => {
    purchaseRef.current = {
      subscriptionId: result.subscriptionId,
      customerId: result.customerId,
    };
    setPaid(true);
  }, []);

  const onEditAccount = useCallback(async () => {
    setEditingAccount(true);
    setJustAuthed(false);
    setPaid(false);
    try {
      await signOut(supabase);
    } catch {
      /* ignore — UI already returned to the account step */
    }
  }, [supabase]);

  const annualPlanId = annualPlan?.id;
  const switchToAnnual = useCallback(async () => {
    if (!annualPlanId) return;
    setSwitching(true);
    setSwitchError(null);
    try {
      if (!provider?.switchPlan) throw new Error("Could not switch to annual.");
      await provider.switchPlan({
        planId: annualPlanId,
        ref: purchaseRef.current,
      });
      finishToApp();
    } catch (e) {
      setSwitchError(
        e instanceof Error ? e.message : "Could not switch to annual.",
      );
      setSwitching(false);
    }
  }, [annualPlanId, finishToApp, provider]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="bg-secondary text-secondary-foreground -mx-4 mb-6 py-2 text-center text-sm font-semibold">
        Subscribe and Save
      </div>
      <h1 className="mb-8 text-center text-3xl font-bold">Checkout</h1>
      {workspace && (
        <p className="text-muted-foreground -mt-6 mb-8 text-center text-sm">
          Billed to the <strong>{workspace.name}</strong> workspace — every
          member gets the plan.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* LEFT: the two-step accordion (stacks first on mobile). */}
        <div className="flex flex-col gap-4">
          {/* Step 1 — Account */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <StepBadge n={1} done={accountDone} />
                  <h2 className="text-lg font-semibold">Account</h2>
                </div>
                {accountDone && (
                  <div className="flex items-center gap-2">
                    {user?.email && (
                      <span className="text-muted-foreground text-sm">
                        {user.email}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit account"
                      onClick={() => void onEditAccount()}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            {!accountDone && (
              <CardContent>
                <div className="mx-auto max-w-sm">
                  <HostComponent
                    name="auth-flow"
                    {...({
                      mode: "signIn",
                      settings: authSettings,
                      appName,
                      onAuthenticated: () => {
                        setJustAuthed(true);
                        setEditingAccount(false);
                      },
                      redirectTo: `/checkout?plan=${encodeURIComponent(
                        String(planId),
                      )}&step=payment`,
                    } satisfies CheckoutAuthProps)}
                    fallback={
                      <Button asChild className="w-full">
                        <a
                          href={`/sign-in?redirectTo=${encodeURIComponent(
                            `/checkout?plan=${String(planId)}&step=payment`,
                          )}`}
                        >
                          Sign in to continue
                        </a>
                      </Button>
                    }
                  />
                </div>
              </CardContent>
            )}
          </Card>

          {/* Step 2 — Payment */}
          <Card className={!accountDone ? "opacity-60" : undefined}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <StepBadge n={2} done={paid} />
                <h2 className="text-lg font-semibold">Payment</h2>
              </div>
            </CardHeader>
            {accountDone && (
              <CardContent>
                {paid ? (
                  <div className="flex flex-col items-center gap-4 py-4 text-center">
                    {showUpsell && upsellCopy ? (
                      <>
                        <h3 className="text-lg font-semibold">
                          {upsellCopy.headline}
                        </h3>
                        <p className="text-sm">{upsellCopy.priceLine}</p>
                        {upsellCopy.savingsLine && (
                          <p className="text-primary text-sm font-medium">
                            {upsellCopy.savingsLine}
                          </p>
                        )}
                        {switchError && (
                          <p className="text-destructive text-sm">
                            {switchError}
                          </p>
                        )}
                        <Button
                          className="w-full"
                          disabled={switching}
                          onClick={() => void switchToAnnual()}
                        >
                          {switching ? "Switching…" : upsellCopy.cta}
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={switching}
                          onClick={finishToApp}
                        >
                          Maybe later
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
                          <Check className="size-6" />
                        </div>
                        <h3 className="text-lg font-semibold">
                          You&apos;re in.
                        </h3>
                        <p className="text-muted-foreground text-sm">
                          Your subscription is active.
                        </p>
                        <Button
                          className="w-full"
                          onClick={() => {
                            if (canUpsell) setShowUpsell(true);
                            else finishToApp();
                          }}
                        >
                          Continue
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <CheckoutPayment
                    planId={planId}
                    orgId={workspace?.id ?? null}
                    plan={plan}
                    copy={copy}
                    onPaid={onPaid}
                  />
                )}
              </CardContent>
            )}
          </Card>
        </div>

        {/* RIGHT: plan summary + testimonial (drops below the form on mobile). */}
        <div className="flex flex-col gap-4">
          <PlanSummary plan={plan} />
          {testimonial && <CheckoutTestimonial testimonial={testimonial} />}
        </div>
      </div>
    </div>
  );
}

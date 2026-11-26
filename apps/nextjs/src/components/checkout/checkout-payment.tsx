"use client";

// Step 2 of the Bloomberg-style checkout: the payment form, rendered INLINE on
// the page. Provider-neutral — the form itself is the installed billing
// payment provider's `PaymentForm` (e.g. Stripe Elements: Apple/Google Pay +
// card + Link, with the purchase created at confirm time), found through the
// module adapter registry. No provider SDK is imported here.
import { useCallback } from "react";

import { useSupabase } from "@acme/api";
import { ensureAnonSession } from "@acme/app";

import type { PaidResult } from "~/components/paywall/payment-provider";
import type { PaywallCopy, PlanLite } from "~/lib/paywall-copy";
import { useCaptcha } from "~/components/captcha/captcha-provider";
import { useWebPaymentProvider } from "~/components/paywall/payment-provider";

export type { PaidResult };

export function CheckoutPayment({
  planId,
  plan,
  copy,
  onPaid,
}: {
  planId: string | number;
  plan: PlanLite;
  copy: PaywallCopy;
  onPaid: (result: PaidResult) => void;
}) {
  const provider = useWebPaymentProvider();
  const supabase = useSupabase();
  const { token: captchaToken, reset: resetCaptcha } = useCaptcha();

  // The buyer is already signed in by the Account step, so the purchase is
  // stamped with their user id; the anon ensure is a no-op safety net for the
  // rare logged-out edge. CAPTCHA tokens are single-use — reset after.
  const beforeCreate = useCallback(async () => {
    try {
      await ensureAnonSession(supabase, { captchaToken });
    } catch {
      /* anon/CAPTCHA unavailable — the webhook fallback still links it */
    } finally {
      resetCaptcha();
    }
  }, [supabase, captchaToken, resetCaptcha]);

  if (!provider) {
    return (
      <p className="text-muted-foreground text-sm">
        Purchases aren’t available right now.
      </p>
    );
  }
  return (
    <provider.PaymentForm
      variant="checkout"
      planId={planId}
      plan={plan}
      cta="Purchase Subscription"
      fineprint={copy.fineprint}
      beforeCreate={beforeCreate}
      onPaid={onPaid}
    />
  );
}

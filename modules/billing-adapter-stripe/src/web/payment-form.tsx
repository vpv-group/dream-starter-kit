"use client";

// Stripe's payment step for billing's paywall and /checkout page — the
// `PaymentForm` of this adapter's web provider. It mounts DEFERRED Elements
// ({mode, amount, currency}, no server round-trip) so the Apple/Google Pay
// button renders instantly; the PaymentIntent/subscription is created only at
// confirm time (`createPurchase` → POST /express-intent), which also avoids
// spawning a throwaway incomplete subscription on every open.
//
// Two looks, one flow:
//   - "paywall": the dark wallet-first consent screen inside the paywall modal
//     (the host's paywall.css styles its `dr-*` classes). The live wallet
//     button renders right away, but its sheet opens only once the consent
//     box is checked; the card path shows the Payment Element + pay button,
//     also gated.
//   - "checkout": the inline form on /checkout (shared UI primitives).
//
// When staff choose the Stripe-hosted Checkout page (Billing → Stripe), both
// render a single "continue to secure checkout" button instead.
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Elements,
  ExpressCheckoutElement,
  LinkAuthenticationElement,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

import type {
  BuyerDetails,
  CreatedPurchase,
  PaymentFormProps,
} from "@acme/mod-billing";
import { Button } from "@acme/ui/button";
import { Checkbox } from "@acme/ui/checkbox";
import { Label } from "@acme/ui/label";
import { Separator } from "@acme/ui/separator";

import type { StripeClientConfig } from "./stripe-js";
import { createPurchase } from "./api";
import { deferredElementsOptions } from "./deferred";
import { getStripeConfig, getStripePromise } from "./stripe-js";
import { useWalletName } from "./wallet";

type Confirm = (details?: BuyerDetails) => Promise<void>;

/**
 * The deferred confirm shared by both looks: validate the elements, create
 * the purchase server-side, then confirm against it.
 */
function useConfirm({
  planId,
  orgId,
  beforeCreate,
  createPurchase: createOverride,
  onPaid,
  cardEmail,
}: Pick<
  PaymentFormProps,
  "planId" | "orgId" | "beforeCreate" | "createPurchase" | "onPaid"
> & {
  cardEmail?: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm: Confirm = async (details) => {
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Please check your details.");
      setBusy(false);
      return;
    }

    // Prefer wallet billingDetails; fall back to the card-form email.
    const buyer: BuyerDetails | undefined =
      details ?? (cardEmail ? { email: cardEmail } : undefined);

    let purchase: CreatedPurchase;
    try {
      if (beforeCreate) await beforeCreate().catch(() => undefined);
      purchase = await (
        createOverride ?? ((d) => createPurchase(planId, d, orgId))
      )(buyer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start checkout.");
      setBusy(false);
      return;
    }

    const confirmParams = {
      return_url: `${window.location.origin}/checkout/return`,
    };
    const result =
      purchase.mode === "setup"
        ? await stripe.confirmSetup({
            elements,
            clientSecret: purchase.clientSecret,
            confirmParams,
            redirect: "if_required",
          })
        : await stripe.confirmPayment({
            elements,
            clientSecret: purchase.clientSecret,
            confirmParams,
            redirect: "if_required",
          });
    if (result.error) {
      setError(result.error.message ?? "Payment failed. Please try again.");
      setBusy(false);
      return;
    }
    const intentId =
      "setupIntent" in result ? result.setupIntent.id : result.paymentIntent.id;
    onPaid({
      intentId,
      details: buyer,
      subscriptionId: purchase.subscriptionId,
      customerId: purchase.customerId,
    });
  };

  return { confirm, busy, error, ready: Boolean(stripe) };
}

/** Wallet billingDetails → BuyerDetails. */
function walletDetails(e: {
  billingDetails?: {
    name?: string;
    email?: string;
    phone?: string;
    address?: unknown;
  };
}): BuyerDetails {
  return {
    name: e.billingDetails?.name,
    email: e.billingDetails?.email,
    phone: e.billingDetails?.phone,
    address: e.billingDetails?.address as Record<string, unknown> | undefined,
  };
}

const WALLET_OPTIONS = {
  buttonHeight: 48,
  buttonType: { applePay: "plain", googlePay: "plain" },
  emailRequired: true,
  phoneNumberRequired: true,
  billingAddressRequired: true,
} as const;

/* ------------------------------- paywall look ------------------------------ */

function PaywallPayment(props: PaymentFormProps & { wallets: boolean }) {
  const { cta, fineprint, onBack, wallets } = props;
  const [method, setMethod] = useState<"wallet" | "card">(
    wallets ? (props.initialMethod ?? "wallet") : "card",
  );
  const [agreed, setAgreed] = useState(false);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [walletReady, setWalletReady] = useState<boolean | null>(null);
  const [cardEmail, setCardEmail] = useState<string>();
  const name = useWalletName();
  const { confirm, busy, error, ready } = useConfirm({ ...props, cardEmail });

  return (
    <div className="dr-inner">
      <div className="dr-terms-head">
        <button className="dr-back" onClick={onBack} aria-label="Back">
          ‹
        </button>
        <h2 className="dr-terms-h">Terms &amp; Conditions</h2>
      </div>
      <p className="dr-terms-body">{fineprint}</p>

      {/* Consent is required to pay. Trying without it turns the text red. */}
      <label className={`dr-consent ${needsConsent ? "dr-consent-error" : ""}`}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => {
            setAgreed(e.target.checked);
            if (e.target.checked) setNeedsConsent(false);
          }}
        />
        <span>
          Please check this box to indicate that you agree to the terms and
          conditions above, including the{" "}
          <Link
            href="/legal/terms-of-service"
            target="_blank"
            className="underline"
          >
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link
            href="/legal/privacy-policy"
            target="_blank"
            className="underline"
          >
            Privacy Policy
          </Link>
          .
        </span>
      </label>

      {error && (
        <p className="mb-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {method === "card" ? (
        <>
          <div className="dr-pay-wrap">
            {/* The email creates/converts the account and gets the receipt. */}
            <LinkAuthenticationElement
              onChange={(e) => setCardEmail(e.value.email)}
            />
            <PaymentElement options={{ layout: "tabs" }} />
          </div>
          <button
            className="pay-btn"
            style={{ margin: "16px auto 0" }}
            disabled={!agreed || busy || !ready}
            onClick={() => void confirm()}
          >
            {busy ? "Processing…" : cta}
          </button>
          {wallets && (
            <button className="dr-cc" onClick={() => setMethod("wallet")}>
              Use {name} instead
            </button>
          )}
        </>
      ) : (
        <>
          {/* The LIVE wallet button renders right away; onClick holds the OS
              sheet until the consent box is checked. */}
          <div className="dr-pay-wrap">
            <ExpressCheckoutElement
              onReady={({ availablePaymentMethods }) =>
                setWalletReady(!!availablePaymentMethods)
              }
              onClick={({ resolve }) => {
                if (!agreed) {
                  setNeedsConsent(true);
                  return;
                }
                resolve();
              }}
              onConfirm={(e) => void confirm(walletDetails(e))}
              options={WALLET_OPTIONS}
            />
            {walletReady === false && (
              <p className="dr-fineprint">
                {name} isn’t available here — use a card below.
              </p>
            )}
          </div>
          <button className="dr-cc" onClick={() => setMethod("card")}>
            Or pay with credit card
          </button>
        </>
      )}
    </div>
  );
}

/* ------------------------------ checkout look ------------------------------ */

function CheckoutPayment(props: PaymentFormProps & { wallets: boolean }) {
  const { cta, fineprint, wallets } = props;
  const [agreed, setAgreed] = useState(false);
  const [needsConsent, setNeedsConsent] = useState(false);
  const [walletReady, setWalletReady] = useState<boolean | null>(
    wallets ? null : false,
  );
  const [cardEmail, setCardEmail] = useState<string>();
  const wallet = useWalletName();
  const { confirm, busy, error, ready } = useConfirm({ ...props, cardEmail });

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      {/* Express wallets (Apple Pay / Google Pay). Renders only where available. */}
      {wallets && (
        <div
          className={walletReady === false ? "hidden" : "flex flex-col gap-3"}
        >
          <ExpressCheckoutElement
            onReady={({ availablePaymentMethods }) =>
              setWalletReady(!!availablePaymentMethods)
            }
            onClick={({ resolve }) => {
              if (!agreed) {
                setNeedsConsent(true);
                return;
              }
              resolve();
            }}
            onConfirm={(e) => void confirm(walletDetails(e))}
            options={WALLET_OPTIONS}
          />
          {walletReady && (
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-muted-foreground text-xs">
                or pay with card
              </span>
              <Separator className="flex-1" />
            </div>
          )}
        </div>
      )}

      {/* Card + Link. The email feeds account creation/receipts. */}
      <div className="bg-muted/40 flex flex-col gap-3 rounded-lg border p-4">
        <LinkAuthenticationElement
          onChange={(e) => setCardEmail(e.value.email)}
        />
        <PaymentElement options={{ layout: "tabs" }} />
      </div>

      {/* Terms gate. */}
      <div className="flex items-start gap-2">
        <Checkbox
          id="checkout-terms"
          checked={agreed}
          onCheckedChange={(v) => {
            setAgreed(v === true);
            if (v === true) setNeedsConsent(false);
          }}
          aria-invalid={needsConsent}
        />
        <Label
          htmlFor="checkout-terms"
          className={`text-sm leading-snug font-normal ${
            needsConsent ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {fineprint}
        </Label>
      </div>

      <Button
        size="lg"
        className="w-full"
        disabled={!agreed || busy || !ready}
        onClick={() => void confirm()}
      >
        {busy ? "Processing…" : cta}
      </Button>
      {wallets && walletReady === false && (
        <p className="text-muted-foreground text-center text-xs">
          {wallet} isn’t available here — pay with a card above.
        </p>
      )}
    </div>
  );
}

/* ------------------------------ hosted checkout ---------------------------- */

/** Staff chose the Stripe-hosted page: one button that redirects there. */
function HostedCheckout({
  planId,
  orgId,
  cta,
  variant,
  fineprint,
}: PaymentFormProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mod/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          provider: "stripe",
          ...(orgId ? { orgId } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url)
        throw new Error(data.error ?? "Checkout failed");
      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
      setBusy(false);
    }
  }
  const button =
    variant === "paywall" ? (
      <button
        className="pay-btn"
        style={{ margin: "16px auto 0" }}
        disabled={busy}
        onClick={() => void go()}
      >
        {busy ? "Opening checkout…" : cta}
      </button>
    ) : (
      <Button
        size="lg"
        className="w-full"
        disabled={busy}
        onClick={() => void go()}
      >
        {busy ? "Opening checkout…" : cta}
      </Button>
    );
  return (
    <div className={variant === "paywall" ? "dr-inner" : "flex flex-col gap-4"}>
      {variant === "paywall" && <p className="dr-terms-body">{fineprint}</p>}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      {button}
      <p
        className={
          variant === "paywall"
            ? "dr-fineprint"
            : "text-muted-foreground text-center text-xs"
        }
      >
        You’ll finish on Stripe’s secure checkout page.
      </p>
    </div>
  );
}

/* --------------------------------- the form -------------------------------- */

function Unavailable({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
}

export function PaymentForm(props: PaymentFormProps) {
  const [config, setConfig] = useState<StripeClientConfig | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    getStripeConfig()
      .then((c) => live && setConfig(c))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const deferred = deferredElementsOptions(props.plan);
  if (failed)
    return <Unavailable>Checkout is unavailable right now.</Unavailable>;
  if (!config) return <Unavailable>Loading secure checkout…</Unavailable>;
  if (!config.enabled) {
    return <Unavailable>Payments aren’t set up yet.</Unavailable>;
  }
  if (config.checkoutExperience === "hosted" && !props.createPurchase) {
    return <HostedCheckout {...props} />;
  }
  if (!config.publishableKey || !deferred) {
    return (
      <Unavailable>This plan isn’t available for purchase yet.</Unavailable>
    );
  }
  const paywall = props.variant === "paywall";
  return (
    // Keyed by amount so an amount change remounts cleanly.
    <Elements
      key={`${deferred.mode}-${deferred.amount ?? 0}`}
      stripe={getStripePromise()}
      options={{
        // Spread the discriminated union whole so stripe-js narrows `mode`.
        ...deferred,
        appearance: paywall
          ? {
              theme: "night",
              labels: "floating",
              variables: { borderRadius: "8px" },
            }
          : { theme: "stripe", variables: { borderRadius: "8px" } },
      }}
    >
      {paywall ? (
        <PaywallPayment {...props} wallets={config.expressWallets} />
      ) : (
        <CheckoutPayment {...props} wallets={config.expressWallets} />
      )}
    </Elements>
  );
}

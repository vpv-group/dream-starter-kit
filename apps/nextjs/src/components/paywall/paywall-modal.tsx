"use client";

// Two-state paywall (offer → terms → paid). Provider-neutral: the offer screen,
// the success / "check your email" / annual-upsell screens and the account
// conversion live here; the consent + payment step is the installed billing
// payment provider's `PaymentForm` (e.g. billing-adapter-stripe: deferred
// Stripe Elements with Apple/Google Pay), found through the module adapter
// registry (./payment-provider.ts). No provider SDK is imported here.
//
// All pricing + fine print is pulled from the Payload CMS plan
// (lib/paywall-copy.ts), never hardcoded.
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";

import { useSession, useSupabase } from "@acme/api";
import {
  convertAnonToPermanent,
  ensureAnonSession,
  isAnonymousUser,
} from "@acme/app";

import type {
  CheckoutVariant,
  CreatedPurchase,
  PaidResult,
  PayMethod,
  PurchaseRef,
} from "./payment-provider";
import type { BuyerDetails, PaywallCopy, PlanLite } from "~/lib/paywall-copy";
import { useCaptcha } from "~/components/captcha/captcha-provider";
import { buildPlanCopy, buildUpsellCopy } from "~/lib/paywall-copy";
import { useWebPaymentProvider } from "./payment-provider";
import { PaywallOffer } from "./paywall-offer";

export type PaywallStep = "offer" | "terms";

/**
 * Mirror the just-signed-in buyer into Payload's `users` collection. The guest
 * checkout flow establishes the session client-side and never hits /welcome or
 * /auth/callback (the only routes that run the mirror), so call the host
 * endpoint here. Best-effort — the (app) layout backstop + `cms:backfill-users`
 * catch anyone this misses.
 */
async function mirrorSelf(): Promise<void> {
  try {
    await fetch("/api/cms/mirror-self", { method: "POST" });
  } catch {
    /* best-effort — backstopped by the (app) layout + backfill */
  }
}

export interface PaywallModalProps {
  open: boolean;
  variant: CheckoutVariant;
  /** Resolved Payload plan id. */
  planId?: string | number | null;
  /** Resolved Payload plan (pricing + fine-print source). */
  plan?: PlanLite | null;
  /** The yearly plan offered as a 1-click upsell after purchase (if distinct). */
  annualPlan?: PlanLite | null;
  /** Step to open at. The detail-page gate dock is itself the offer, so it
   *  opens the modal directly at "terms" (no duplicate offer screen). */
  initialStep?: PaywallStep;
  /** Method to preselect on the terms screen ("wallet" by default). */
  initialMethod?: PayMethod;
  onClose: () => void;
  onSuccess: () => void;
  // --- Optional module points (default = the generic single-plan paywall) ---
  // These let a product surface reuse this exact modal — and so inherit every
  // upstream fix — by injecting flow-specific copy / pricing / purchase routes,
  // instead of forking the component. All optional; when unset the modal behaves
  // exactly as before.
  /** Override the CMS-derived copy (e.g. a flow-specific headline/CTA). */
  copy?: PaywallCopy;
  /** Content rendered above the offer headline (e.g. a cross-sell between plans). */
  offerTopSlot?: ReactNode;
  /** Success-screen heading override (default "You're in."). */
  paidTitle?: ReactNode;
  /** Success-screen body override (default "Premium access unlocked."). */
  paidBody?: ReactNode;
  /** Replace the provider's purchase creation (e.g. a one-time purchase route). */
  createIntent?: (details?: BuyerDetails) => Promise<CreatedPurchase>;
  /** Run after the payment confirms, before the success screen (e.g. a server
   *  confirm/stamp step). Best-effort; throwing won't block the success screen. */
  onAfterPaid?: (
    intentId?: string,
    details?: BuyerDetails,
  ) => void | Promise<void>;
  /** One-time purchase: no anon→permanent identity step or annual upsell — the
   *  success screen finishes straight through `onSuccess`. */
  oneTime?: boolean;
}

export function PaywallModal({
  open,
  variant,
  planId,
  plan,
  annualPlan,
  initialStep = "offer",
  initialMethod = "wallet",
  onClose,
  onSuccess,
  copy: copyProp,
  offerTopSlot,
  paidTitle,
  paidBody,
  createIntent: createIntentProp,
  onAfterPaid,
  oneTime = false,
}: PaywallModalProps) {
  const supabase = useSupabase();
  const provider = useWebPaymentProvider();
  const { user } = useSession();
  const { token: captchaToken, reset: resetCaptcha } = useCaptcha();

  const [step, setStep] = useState<PaywallStep>(initialStep);
  const [method, setMethod] = useState<PayMethod>(initialMethod);
  const [paid, setPaid] = useState(false);
  // Post-purchase upsell: shown after a purchase when a distinct annual plan
  // exists. `switching` covers the in-flight switch request.
  const [upsell, setUpsell] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  // Buyer identity captured at checkout (wallet/card) — drives anon→permanent
  // conversion. `checkEmail` shows the "confirm your email" screen afterwards.
  const buyerRef = useRef<BuyerDetails | undefined>(undefined);
  // What was just bought (subscription + customer ids) — threaded to the
  // annual upgrade and the guest-account step so neither depends on the
  // (webhook-written) customer link.
  const purchaseRef = useRef<PurchaseRef>({});
  // Existence-agnostic "check your email" screen — the copy doesn't reveal
  // whether the address already had an account, so a single email is all we track.
  const [checkEmail, setCheckEmail] = useState<null | { email: string }>(null);
  // The page the buyer started on, so the confirmation email returns them here.
  const originRef = useRef<string>("/");
  useEffect(() => {
    originRef.current = window.location.pathname + window.location.search;
  }, []);

  const computedCopy = useMemo(() => buildPlanCopy(plan), [plan]);
  const copy = copyProp ?? computedCopy;

  // Only upsell to annual when a distinct annual plan is available (and the
  // bought plan isn't already that annual plan).
  const canUpsell = !!annualPlan?.id && annualPlan.id !== planId;
  const upsellCopy = useMemo(
    () => (annualPlan ? buildUpsellCopy(annualPlan, plan) : null),
    [annualPlan, plan],
  );

  // Fire confetti when the success screen appears. An opening burst plus a brief
  // emission loop (~1s) so the celebration lingers about a second longer.
  useEffect(() => {
    if (!paid) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const end = Date.now() + 1000;
    void confetti({
      particleCount: 120,
      spread: 75,
      origin: { y: 0.6 },
      disableForReducedMotion: true,
    });
    const tick = () => {
      void confetti({
        particleCount: 24,
        spread: 70,
        startVelocity: 35,
        origin: { y: 0.6 },
        disableForReducedMotion: true,
      });
      if (Date.now() < end) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paid]);

  // After payment: if the buyer is anonymous and we captured an email, convert
  // the account (Supabase sends a confirmation email that returns them to where
  // they started). Otherwise finish normally.
  const proceedAfterPay = useCallback(async () => {
    const email = buyerRef.current?.email?.trim();
    // Already a permanent signed-in buyer (or no email to attach) → just finish;
    // gating flips off the subscription row, no email confirmation needed.
    if ((user && !isAnonymousUser(user)) || !email) {
      onSuccess();
      return;
    }
    // Guest buyer with no anonymous session (e.g. anon sign-in / Turnstile
    // unavailable). Don't just promise an email and bank on the webhook —
    // create/link the account NOW through the payment provider (it sends the
    // set-password invite and links the purchase), with the provider's
    // webhook as the idempotent backstop. Best-effort: still show the screen
    // on failure.
    if (!user) {
      let loginToken: string | undefined;
      try {
        loginToken = (
          await provider?.completeGuestPurchase?.({
            email,
            name: buyerRef.current?.name,
            phone: buyerRef.current?.phone,
            // Wallet billing address (incl. zip) → stored on the Supabase user
            // and mirrored into cms.users.address.
            address: buyerRef.current?.address,
            ref: purchaseRef.current,
          })
        )?.loginToken;
      } catch {
        /* best-effort — the provider's webhook backstops account creation */
      }
      // Log the buyer into THIS browser so access unlocks immediately and they
      // don't depend on the emailed link (which often opens in a different
      // browser / in-app webview). Verifying a one-time token needs no CAPTCHA.
      // Best-effort: fall back to the "check your email" screen.
      if (loginToken) {
        try {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: loginToken,
            type: "magiclink",
          });
          if (!error) {
            // This guest flow signs the buyer in client-side and unlocks inline
            // — it never passes through /welcome or /auth/callback, the only
            // server routes that mirror the user into Payload's `users`
            // collection. Mirror them now so they appear in the admin Users
            // page. Best-effort (the (app) layout + backfill backstop it).
            await mirrorSelf();
            onSuccess();
            return;
          }
        } catch {
          /* fall through to the email screen */
        }
      }
      setCheckEmail({ email });
      return;
    }
    const next = `/confirm-email?next=${encodeURIComponent(originRef.current)}`;
    const walletAddress = buyerRef.current?.address ?? undefined;
    const walletPostal =
      walletAddress && typeof walletAddress.postal_code === "string"
        ? walletAddress.postal_code
        : undefined;
    try {
      await convertAnonToPermanent(supabase, email, {
        emailRedirectTo: `${window.location.origin}${next}`,
        // Carry the full wallet identity into user_metadata so the cms.users
        // mirror gets name/phone/billing address (incl. zip) on this path too.
        data: {
          display_name: buyerRef.current?.name ?? undefined,
          phone: buyerRef.current?.phone ?? undefined,
          ...(walletPostal ? { billing_postal_code: walletPostal } : {}),
          ...(walletAddress ? { billing_address: walletAddress } : {}),
        },
      });
      setCheckEmail({ email });
    } catch (e) {
      // Email already belongs to an account → merge this purchase into it.
      const code = (e as { code?: string }).code;
      if (code === "email_exists" || /already|exists/i.test(String(e))) {
        await fetch("/api/auth/merge-anon", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }).catch(() => undefined);
        setCheckEmail({ email });
      } else {
        // Conversion failed (transient) — they're still premium as an anon user;
        // don't block. Finish; they can convert later from settings.
        onSuccess();
      }
    }
  }, [supabase, user, onSuccess, provider]);

  const annualPlanId = annualPlan?.id;
  // 1-click switch to annual using the card on file (post-purchase upsell).
  const switchToAnnual = useCallback(async () => {
    if (!annualPlanId) return;
    setSwitching(true);
    setSwitchError(null);
    try {
      if (!provider?.switchPlan) throw new Error("Could not switch to annual.");
      await provider.switchPlan({
        planId: annualPlanId,
        // This exact subscription, without depending on the (webhook-written,
        // possibly-not-yet-present) customer link.
        ref: purchaseRef.current,
        // Guest (no session) upsell: verified against the purchase.
        email: buyerRef.current?.email?.trim() || undefined,
      });
      await proceedAfterPay();
    } catch (e) {
      setSwitchError(
        e instanceof Error ? e.message : "Could not switch to annual.",
      );
      setSwitching(false);
    }
  }, [annualPlanId, proceedAfterPay, provider]);

  // Before the provider creates the purchase: make sure the buyer has a
  // session (anonymous if logged out) so the purchase links to a real account
  // (closes the embedded-checkout gap). CAPTCHA tokens are single-use — reset.
  const beforeCreate = useCallback(async () => {
    try {
      await ensureAnonSession(supabase, { captchaToken });
    } catch {
      /* CAPTCHA/anon failed — proceed; the guest webhook fallback applies */
    } finally {
      resetCaptcha();
    }
  }, [supabase, captchaToken, resetCaptcha]);

  if (!open) return null;

  const isDock = variant === "dock";
  const isFull = variant === "full";
  const panelClass =
    (isFull ? "co-panel" : isDock ? "drawer dock" : "drawer") +
    (step === "terms" && !paid ? " is-terms" : "");

  async function finishPayment({ intentId, details, ...ref }: PaidResult) {
    buyerRef.current = details;
    purchaseRef.current = ref;
    // Optional server confirm/stamp step (e.g. a one-time purchase). Best-effort —
    // it's idempotent and retryable, so a failure must not block the success UI.
    if (onAfterPaid) {
      try {
        await onAfterPaid(intentId, details);
      } catch {
        /* swallow — see above */
      }
    }
    setPaid(true);
  }

  return (
    <div
      className={isDock ? "dr-dock" : "dr-scrim" + (isFull ? " co-full" : "")}
      onMouseDown={(e) => {
        if (!isDock && (e.target as HTMLElement).classList.contains("dr-scrim"))
          onClose();
      }}
    >
      {isDock && <div className="dr-dock-fade" aria-hidden="true" />}
      <div className={panelClass} role="dialog" aria-modal="true">
        {!isFull && !isDock && <div className="dr-handle" aria-hidden="true" />}
        {!isDock && (
          <button className="dr-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}

        {checkEmail ? (
          // Post-purchase: tell the buyer to check their email. Deliberately
          // existence-agnostic (doesn't reveal whether the address had an
          // account) — the guest-account route sends a login/set-password link.
          <div className="dr-paid">
            <div className="dr-check">✉</div>
            <h2>Check your email</h2>
            <p>
              If you have an account, we have sent a login link to{" "}
              <strong>{checkEmail.email}</strong>.
            </p>
            <button
              className="pay-btn"
              style={{ margin: "0 auto" }}
              onClick={onSuccess}
            >
              Done
            </button>
          </div>
        ) : paid && upsell && upsellCopy ? (
          // Post-purchase 1-click upsell to the annual plan.
          <div className="dr-paid dr-upsell">
            <h2>{upsellCopy.headline}</h2>
            <p className="dr-upsell-price">{upsellCopy.priceLine}</p>
            {upsellCopy.savingsLine && (
              <p className="dr-upsell-save">{upsellCopy.savingsLine}</p>
            )}
            <ul className="dr-upsell-list">
              {upsellCopy.benefits.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            {switchError && (
              <p className="mb-3 text-sm text-red-400" role="alert">
                {switchError}
              </p>
            )}
            <button
              className="pay-btn"
              style={{ margin: "4px auto 0" }}
              disabled={switching}
              onClick={() => void switchToAnnual()}
            >
              {switching ? "Switching…" : upsellCopy.cta}
            </button>
            <button
              className="dr-cc"
              disabled={switching}
              onClick={() => void proceedAfterPay()}
            >
              Maybe later
            </button>
            <p className="dr-fineprint">{upsellCopy.fineprint}</p>
          </div>
        ) : paid ? (
          <div className="dr-paid">
            <div className="dr-check">✓</div>
            <h2>{paidTitle ?? "You're in."}</h2>
            <p>{paidBody ?? "Premium access unlocked."}</p>
            <button
              className="pay-btn"
              style={{ margin: "0 auto" }}
              onClick={() => {
                if (canUpsell) setUpsell(true);
                else if (oneTime) onSuccess();
                else void proceedAfterPay();
              }}
            >
              Continue
            </button>
          </div>
        ) : step === "offer" ? (
          <PaywallOffer
            headline={copy.headline}
            sub={copy.sub}
            onWallet={() => {
              setMethod("wallet");
              setStep("terms");
            }}
            onCard={() => {
              setMethod("card");
              setStep("terms");
            }}
            onClose={onClose}
            topSlot={offerTopSlot}
          />
        ) : provider && plan && planId != null ? (
          <provider.PaymentForm
            variant="paywall"
            planId={planId}
            plan={plan}
            cta={copy.cta}
            fineprint={copy.fineprint}
            initialMethod={method}
            beforeCreate={beforeCreate}
            createPurchase={createIntentProp}
            onBack={initialStep === "terms" ? onClose : () => setStep("offer")}
            onPaid={(result) => void finishPayment(result)}
          />
        ) : (
          // Plan still resolving (rare — prefetched), or no payment provider
          // installed. Show the offer copy.
          <div className="dr-inner">
            <h2 className="dr-offer-h">{copy.headline}</h2>
            <p className="dr-offer-sub">
              {provider ? copy.sub : "Purchases aren’t available right now."}
            </p>
            <div className="dr-divider" />
            <div className="dr-foot">
              <button onClick={onClose}>Maybe later</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

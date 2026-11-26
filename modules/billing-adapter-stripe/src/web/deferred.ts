import type { PaymentPlan } from "@acme/mod-billing";

/** Deferred-mode `<Elements>` options so the wallet renders before any server
 *  round-trip (the PaymentIntent/subscription is created at confirm time). */
export type DeferredElementsOptions =
  | {
      mode: "payment" | "subscription";
      /** Charge today, in cents. */
      amount: number;
      currency: string;
    }
  | {
      /** $0 today: collect a payment method only (no amount). */
      mode: "setup";
      amount?: undefined;
      currency: string;
    };

/** The enabled intro amount (cents) for a recurring plan, else null. */
function introAmountOf(plan?: PaymentPlan | null): number | null {
  if (plan?.pricingType !== "recurring") return null;
  if (!plan.introOffer?.enabled) return null;
  return plan.introOffer.introAmount ?? null;
}

/**
 * Deferred `<Elements>` options (mode + today's amount + currency) so the
 * Express Checkout wallet button can render immediately — no "preparing
 * secure checkout" wait. Null when the amount isn't known yet (plan still
 * loading), so the caller can hold off mounting Elements.
 */
export function deferredElementsOptions(
  plan?: PaymentPlan | null,
): DeferredElementsOptions | null {
  if (!plan) return null;
  const currency = (plan.currency ?? "usd").toLowerCase();
  if (plan.pricingType === "one_time") {
    return plan.unitAmount != null
      ? { mode: "payment", amount: plan.unitAmount, currency }
      : null;
  }
  // Recurring: today's charge is the intro amount (if any), $0 during a free
  // trial, else the unit price. A $0-today plan collects a payment method via
  // setup mode (matches the express-intent route's setup-intent branch).
  const intro = introAmountOf(plan);
  const hasTrial = (plan.trialDays ?? 0) > 0;
  const today = intro ?? (hasTrial ? 0 : (plan.unitAmount ?? 0));
  return today > 0
    ? { mode: "subscription", amount: today, currency }
    : { mode: "setup", currency };
}

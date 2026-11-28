/**
 * Client-safe barrel. `usePremium()` is billing's SERVICE API (§1.5): any
 * module may `requires: ["billing"]` and gate features behind it. Mobile
 * reads the mod_billing_entitlements view read-own under RLS —
 * golden rule #4 intact.
 */
export { usePremium } from "./hooks/use-premium";
export { usePlans } from "./hooks/use-plans";
export type {
  BillingWebProvider,
  BuyerDetails,
  CreatedPurchase,
  PaidResult,
  PaymentFormProps,
  PaymentPlan,
  PurchaseRef,
} from "./payment";
// Pure paywall copy/pricing helpers (client-safe, no React) — the primitives
// a custom paywall composes its copy from.
export {
  buildPlanCopy,
  buildUpsellCopy,
  cadence,
  formatPrice,
  resolveAnnualPlan,
  resolvePremiumPlan,
} from "./paywall-copy";
export type { PaywallCopy, PlanLite, UpsellCopy } from "./paywall-copy";

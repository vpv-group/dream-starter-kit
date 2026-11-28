export { BillingPage } from "./billing-page";
export { BillingWidget } from "./billing-widget";
export { ManageBillingButton } from "./manage-billing-button";
export { PlanCheckoutButton } from "./plan-checkout-button";
export { PremiumContent } from "./paywall/premium-content";

// Paywall building blocks for a product surface that runs its own purchase
// flows (several plans, a one-time purchase, its own copy). It reuses this
// modal through its optional props (`copy`, `createIntent`, `onAfterPaid`,
// `oneTime`, …) instead of forking it, so paywall fixes reach it too.
export { PaywallModal } from "./paywall/paywall-modal";
export { PaywallOffer } from "./paywall/paywall-offer";
export type { PaywallModalProps, PaywallStep } from "./paywall/paywall-modal";
export type { CheckoutVariant, PayMethod } from "./paywall/payment-provider";
export { useWebPaymentProvider } from "./paywall/payment-provider";

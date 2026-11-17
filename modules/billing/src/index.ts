/**
 * Client-safe barrel. `usePremium()` is billing's SERVICE API (§1.5): any
 * module may `requires: ["billing"]` and gate features behind it. Mobile
 * keeps reading the mod_billing_subscriptions mirror read-own under RLS —
 * golden rule #4 intact.
 */
export { usePremium } from "./hooks/use-premium";
export { usePlans } from "./hooks/use-plans";

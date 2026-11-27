"use client";

// Paywall state shared across the premium-gated content pages. Gating reads the
// viewer's entitlements via `usePremium`; opening the flow launches the paywall
// modal, whose payment step comes from the installed billing payment provider
// (e.g. Stripe). On success it reloads so the server renders unlocked content.
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";

import type { PlanLite } from "../../paywall-copy";
import type { CheckoutVariant, PayMethod } from "./payment-provider";
import { usePremium } from "../../hooks/use-premium";
import { resolveAnnualPlan, resolvePremiumPlan } from "../../paywall-copy";
import { useWebPaymentProvider } from "./payment-provider";

interface ResolvedPlans {
  plan: PlanLite | null;
  /** The yearly plan offered as a 1-click upsell after purchase (if distinct). */
  annualPlan: PlanLite | null;
}

// The paywall modal (and the payment provider's SDK it renders, e.g. Stripe.js)
// is dead weight until someone opens the paywall. Load it lazily (client-only)
// so it stays out of the initial JS bundle and off the FCP/TBT critical path.
const PaywallModal = dynamic(
  () => import("./paywall-modal").then((m) => m.PaywallModal),
  { ssr: false },
);

interface PaywallContextValue {
  isPremium: boolean;
  isLoading: boolean;
  /** The signed-in user's email; null when anonymous. */
  userEmail: string | null;
  /** True while the checkout modal is open (so callers can hide their own gate). */
  isOpen: boolean;
  /** The resolved CMS plan (pricing/fine-print source) — null until loaded. */
  plan: PlanLite | null;
  /** Open the paywall. `dock` opens directly at the terms screen. */
  openPaywall: (variant: CheckoutVariant, method?: PayMethod) => void;
}

const PaywallContext = createContext<PaywallContextValue | null>(null);

export function usePaywall(): PaywallContextValue {
  const ctx = useContext(PaywallContext);
  if (!ctx) throw new Error("usePaywall must be used within <PaywallProvider>");
  return ctx;
}

/**
 * Resolve the premium plan. Seeded from `initialPlan` (SSR'd by the page) so the
 * paywall opens with pricing instantly even on a cold cache; falls back to the
 * public CMS API when no seed is provided. Selection logic is shared
 * (resolvePremiumPlan) so server + client never drift.
 */
function useResolvedPlan(initialPlan?: PlanLite | null) {
  return useQuery<ResolvedPlans>({
    queryKey: ["billing-premium-plan"],
    queryFn: async () => {
      const res = await fetch(
        "/cms-api/mod-billing-plans?where[active][equals]=true&sort=displayOrder&limit=50&depth=0",
      );
      if (!res.ok) return { plan: null, annualPlan: null };
      const data = (await res.json()) as { docs: PlanLite[] };
      const plan = resolvePremiumPlan(data.docs);
      return { plan, annualPlan: resolveAnnualPlan(data.docs, plan?.id) };
    },
    // SSR seeds only the primary plan; the annual upsell plan resolves on the
    // client fetch (it's only needed after a purchase, so there's ample time).
    ...(initialPlan !== undefined
      ? { initialData: { plan: initialPlan, annualPlan: null } }
      : {}),
    staleTime: 5 * 60 * 1000,
  });
}

export function PaywallProvider({
  children,
  initialPlan,
}: {
  children: ReactNode;
  /** Plan resolved server-side (SSR) so the modal has pricing with no fetch. */
  initialPlan?: PlanLite | null;
}) {
  const { isPremium, isLoading, userEmail } = usePremium();
  const { data: plans } = useResolvedPlan(initialPlan);
  const provider = useWebPaymentProvider();
  const plan = plans?.plan ?? null;
  const annualPlan = plans?.annualPlan ?? null;

  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState<CheckoutVariant>("full");
  const [method, setMethod] = useState<PayMethod>("wallet");

  // For a not-yet-premium visitor (who is seeing a gate), eagerly load the
  // provider's SDK + the lazy paywall chunk right after first paint (effects
  // run post-paint, so this never blocks FCP). The wallet button then mounts
  // with no network wait on tap (and Stripe's fraud signals collect on-page).
  const gated = !isPremium && !isLoading;
  useEffect(() => {
    if (!gated || typeof window === "undefined") return;
    void import("./paywall-modal");
    provider?.prefetch?.();
  }, [gated, provider]);

  const openPaywall = useCallback(
    (v: CheckoutVariant, m: PayMethod = "wallet") => {
      setVariant(v);
      setMethod(m);
      setOpen(true);
    },
    [],
  );

  const handleSuccess = useCallback(() => {
    setOpen(false);
    // Premium bodies are withheld server-side until entitled, so a client query
    // invalidation can't reveal the locked content — reload so the server
    // re-renders the now-unlocked page (the sub is already linked by the
    // guest-account route / webhook).
    window.location.reload();
  }, []);

  const value = useMemo<PaywallContextValue>(
    () => ({
      isPremium,
      isLoading,
      userEmail,
      isOpen: open,
      plan: plan ?? null,
      openPaywall,
    }),
    [isPremium, isLoading, userEmail, open, plan, openPaywall],
  );

  const planId = plan?.id ?? null;

  return (
    <PaywallContext.Provider value={value}>
      {/* Warm the TLS/DNS to the provider's hosts for gated visitors so its
          SDK + wallet detection connect faster (React 19 hoists to <head>). */}
      {gated &&
        provider?.preconnect?.map((href) => (
          <link key={href} rel="preconnect" href={href} crossOrigin="" />
        ))}
      {children}
      {/* `.paywall-root` so the modal's design tokens resolve. Only mounted once
          a flow opens, so the lazy modal chunk isn't fetched until then. */}
      {open && (
        <div className="paywall-root">
          <PaywallModal
            open={open}
            variant={variant}
            planId={planId}
            plan={plan}
            annualPlan={annualPlan}
            initialStep={variant === "dock" ? "terms" : "offer"}
            initialMethod={method}
            onClose={() => setOpen(false)}
            onSuccess={handleSuccess}
          />
        </div>
      )}
    </PaywallContext.Provider>
  );
}

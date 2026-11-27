"use client";

import type { ReactNode } from "react";

import type { PlanLite } from "../../paywall-copy";
import { PaywallProvider } from "./paywall-provider";
import { PremiumGate } from "./premium-gate";

/**
 * Billing's `premium-content` slot (manifest `slots.web`): the host wraps a
 * premium body in `<ModSlot name="premium-content" …>` and billing shows it
 * to entitled viewers, or blurred behind the paywall dock to everyone else.
 * Without billing the host renders its fallback; Payload's field access has
 * already withheld the premium body server-side either way.
 */
export function PremiumContent({
  initialPlan,
  children,
}: {
  /** Plan resolved server-side (billing's `getPremiumPlan` service). */
  initialPlan?: PlanLite | null;
  children?: ReactNode;
}) {
  return (
    <PaywallProvider initialPlan={initialPlan}>
      <PremiumGate>{children}</PremiumGate>
    </PaywallProvider>
  );
}

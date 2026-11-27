"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";

import {
  HostComponentsProvider,
  ModAdaptersProvider,
  ModSlotsProvider,
  ModWidgetsProvider,
} from "@acme/mod-kit/react";

import {
  modClientAdapters,
  modSlots,
  modWidgets,
} from "~/mod/registry.client.generated";

/**
 * Core UI modules may render by name (docs/MODULES.md → Host components):
 * billing's checkout embeds the sign-in/sign-up flow.
 */
const hostComponents = {
  // Lazy: only checkout renders it, so it stays out of every page's bundle.
  "auth-flow": dynamic(() =>
    import("~/components/auth/auth-flow").then((m) => m.AuthFlow),
  ),
};

/**
 * Wires the generated client registries into @acme/mod-kit/react so modules
 * (which can't import host registries) can find each other's UI: dashboard
 * widgets, adapters for an extension point (`useModAdapters`, e.g. the
 * billing payment provider the paywall renders), host-rendered slots
 * (`<ModSlot>`, e.g. billing's premium-content gate) and the host components
 * modules may embed. `disabledSlugs` (kit-modules toggles) drops
 * runtime-disabled modules without a redeploy.
 */
export function ModClientProviders({
  disabledSlugs = [],
  children,
}: {
  disabledSlugs?: string[];
  children: ReactNode;
}) {
  const enabled = (slug: string) => !disabledSlugs.includes(slug);
  const slots = Object.fromEntries(
    modSlots.filter((s) => enabled(s.slug)).map((s) => [s.name, s.Component]),
  );
  return (
    <HostComponentsProvider components={hostComponents}>
      <ModAdaptersProvider
        adapters={modClientAdapters.filter(
          (a) => enabled(a.slug) && enabled(a.target),
        )}
      >
        <ModSlotsProvider slots={slots}>{children}</ModSlotsProvider>
      </ModAdaptersProvider>
    </HostComponentsProvider>
  );
}

/**
 * The (app) shell's providers: widgets plus a runtime-filtered copy of the
 * adapters the root layout provides unfiltered (the root stays static,
 * so it can't read kit-modules; the nearest provider wins).
 */
export function AppModWidgetsProvider({
  disabledSlugs,
  children,
}: {
  disabledSlugs: string[];
  children: ReactNode;
}) {
  const widgets = modWidgets.filter((w) => !disabledSlugs.includes(w.slug));
  return (
    <ModClientProviders disabledSlugs={disabledSlugs}>
      <ModWidgetsProvider widgets={widgets}>{children}</ModWidgetsProvider>
    </ModClientProviders>
  );
}

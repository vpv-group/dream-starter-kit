"use client";

import type { ReactNode } from "react";

import { ModWidgetsProvider } from "@acme/mod-kit/react";

import { modWidgets } from "~/mod/registry.client.generated";

/**
 * Wires the generated widget registry into @acme/mod-kit/react so the
 * dashboard module (which can't import host registries) can render the
 * widget grid. The (app) layout passes the runtime-disabled modules
 * (kit-modules toggles) so their widgets disappear without a redeploy.
 */
export function AppModWidgetsProvider({
  disabledSlugs,
  children,
}: {
  disabledSlugs: string[];
  children: ReactNode;
}) {
  const widgets = modWidgets.filter((w) => !disabledSlugs.includes(w.slug));
  return <ModWidgetsProvider widgets={widgets}>{children}</ModWidgetsProvider>;
}

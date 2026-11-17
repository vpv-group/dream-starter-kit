"use client";

import type { ComponentType, ReactNode } from "react";
import { createContext, useContext } from "react";

/**
 * Widget plumbing for the dashboard/home screen (docs/MODULES-PLAN.md §8).
 *
 * Modules can't import the host's generated registries, so the host wires
 * its `modWidgets` (filtered to enabled modules) into this provider once —
 * web in the (app) layout, native in the Expo (app) layout — and the dashboard
 * module renders whatever it finds via `useModWidgets()`. Cross-platform:
 * pure React context, no DOM/RN imports.
 */
export interface ModWidgetEntry {
  slug: string;
  Widget: ComponentType;
}

const ModWidgetsContext = createContext<ModWidgetEntry[]>([]);

export function ModWidgetsProvider({
  widgets,
  children,
}: {
  widgets: ModWidgetEntry[];
  children: ReactNode;
}) {
  return (
    <ModWidgetsContext.Provider value={widgets}>
      {children}
    </ModWidgetsContext.Provider>
  );
}

/** The installed-and-enabled modules' dashboard widgets, host-provided. */
export function useModWidgets(): ModWidgetEntry[] {
  return useContext(ModWidgetsContext);
}

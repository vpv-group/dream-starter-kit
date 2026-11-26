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

/* -------------------------------------------------------------------------- */
/* Client adapters (manifest `adapter.web` / `adapter.native`) — the host      */
/* passes the generated `modClientAdapters` (filtered to enabled modules) in   */
/* once; the target module reads its own with `useModAdapters(target)`.        */
/* -------------------------------------------------------------------------- */

export interface ModClientAdapterEntry<T = unknown> {
  /** The adapter module's slug. */
  slug: string;
  /** The module the adapter plugs into (manifest `adapter.for`). */
  target: string;
  /** The adapter's `./web` (or `./native`) contract export. */
  adapter: T;
}

const ModAdaptersContext = createContext<ModClientAdapterEntry[]>([]);

export function ModAdaptersProvider({
  adapters,
  children,
}: {
  adapters: ModClientAdapterEntry[];
  children: ReactNode;
}) {
  return (
    <ModAdaptersContext.Provider value={adapters}>
      {children}
    </ModAdaptersContext.Provider>
  );
}

/** The installed-and-enabled client adapters for a target module. */
export function useModAdapters<T>(target: string): ModClientAdapterEntry<T>[] {
  const all = useContext(ModAdaptersContext);
  return all.filter((a) => a.target === target) as ModClientAdapterEntry<T>[];
}

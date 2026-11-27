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

/* -------------------------------------------------------------------------- */
/* Slots (manifest `slots.web`) — host-rendered module UI. The host passes the */
/* generated `modSlots` (enabled modules only) in once and renders             */
/* `<ModSlot name="…" fallback={…} {...props} />` where module UI may appear.  */
/* -------------------------------------------------------------------------- */

export type ModSlotMap = Record<string, ComponentType<Record<string, unknown>>>;

const ModSlotsContext = createContext<ModSlotMap>({});

export function ModSlotsProvider({
  slots,
  children,
}: {
  slots: ModSlotMap;
  children: ReactNode;
}) {
  return (
    <ModSlotsContext.Provider value={slots}>
      {children}
    </ModSlotsContext.Provider>
  );
}

/** Whether an installed, enabled module fills the slot. */
export function useHasModSlot(name: string): boolean {
  return name in useContext(ModSlotsContext);
}

/**
 * Render the module component filling `name` with the remaining props, or
 * `fallback` when no installed module fills it (e.g. billing removed →
 * premium content renders without a paywall; the server still withholds
 * premium fields).
 */
export function ModSlot({
  name,
  fallback = null,
  ...props
}: { name: string; fallback?: ReactNode } & Record<string, unknown>) {
  const Slot = useContext(ModSlotsContext)[name];
  if (!Slot) return <>{fallback}</>;
  return <Slot {...props} />;
}

/* -------------------------------------------------------------------------- */
/* Host components — the inverse of slots: core UI a module may render (e.g.   */
/* the host's sign-in/sign-up flow inside billing's checkout). The host        */
/* registers them by name once; a module asks with useHostComponent(name) and  */
/* must handle `null` (a host that doesn't provide it).                        */
/* -------------------------------------------------------------------------- */

/** Name → component; each module types the props it passes (its contract). */
export type HostComponentMap = Record<string, unknown>;

const HostComponentsContext = createContext<HostComponentMap>({});

export function HostComponentsProvider({
  components,
  children,
}: {
  components: HostComponentMap;
  children: ReactNode;
}) {
  return (
    <HostComponentsContext.Provider value={components}>
      {children}
    </HostComponentsContext.Provider>
  );
}

/**
 * Render the host component `name` with the remaining props (the module's
 * contract), or `fallback` when the host doesn't provide it.
 */
export function HostComponent({
  name,
  fallback = null,
  ...props
}: { name: string; fallback?: ReactNode } & Record<string, unknown>) {
  const C = useContext(HostComponentsContext)[name] as
    ComponentType<Record<string, unknown>> | undefined;
  if (!C) return <>{fallback}</>;
  return <C {...props} />;
}

/** A host-provided component by name (typed by the module's contract), or null. */
export function useHostComponent<P>(name: string): ComponentType<P> | null {
  const c = useContext(HostComponentsContext)[name];
  return (c as ComponentType<P> | undefined) ?? null;
}

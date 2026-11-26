"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useSession, useSupabase } from "@acme/api";

import type { CoreNavItem } from "../nav/core-nav";
import type {
  NativeMenu,
  NativeNavConfig,
  NavUserContext,
} from "../nav/native-nav";
import type { KeyValueStorage } from "../nav/native-nav-store";
import { CORE_NAV_ITEMS } from "../nav/core-nav";
import {
  buildNativeMenu,
  mergeNativeNav,
  nativeNavConfigSchema,
} from "../nav/native-nav";
import {
  loadNativeMenuForLaunch,
  nativeNavCacheKey,
  recordFetchedNativeMenu,
  saveAppliedNativeMenu,
} from "../nav/native-nav-store";
import { fetchNavUserContext } from "../nav/user-context";

// `process.env.*_PUBLIC_*` is inlined by each platform's bundler (Metro / Next).
declare const process: { env: Record<string, string | undefined> };

const CMS_BASE =
  process.env.EXPO_PUBLIC_CMS_URL ?? process.env.NEXT_PUBLIC_CMS_URL ?? "";

/** Generated manifest nav default (apps/expo/src/mod/registry.generated.ts). */
export interface NativeNavDefault {
  module: string;
  title: string;
  href: string;
  icon?: string;
  order: number;
  audience?: "everyone" | "staff" | "members";
}

/**
 * The bundled menu — core + installed modules' manifest defaults, in their
 * default order — used on first launch when the CMS is unreachable.
 */
export function defaultNativeNavConfig(input: {
  modDefaults: NativeNavDefault[];
  modules: { slug: string; accessCheck?: string | null }[];
  core?: CoreNavItem[];
}): Pick<NativeNavConfig, "tabCount" | "items"> {
  const rows = [
    ...(input.core ?? CORE_NAV_ITEMS)
      .filter((c) => c.platforms.includes("native"))
      .map((c) => ({ ...c, module: null as string | null, audience: null })),
    ...input.modDefaults.map((d) => ({
      key: `mod:${d.module}:${d.href}`,
      label: d.title,
      href: d.href,
      icon: d.icon,
      order: d.order,
      module: d.module,
      audience: d.audience ?? null,
    })),
  ].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
  return mergeNativeNav({
    navItems: rows.map((r) => ({ ...r, platforms: ["native"], enabled: true })),
    rows: [],
    modules: input.modules,
  });
}

export interface UseNativeNavOptions {
  /** Persistent storage for the offline cache (AsyncStorage on native). */
  storage: KeyValueStorage;
  /** Hrefs this build has screens for; anything else is dropped. */
  availableHrefs: ReadonlySet<string>;
  /** Bundled menu for a first launch with no network. */
  fallback: Pick<NativeNavConfig, "tabCount" | "items">;
  /** How long a first launch waits for the network before the fallback. */
  firstLaunchTimeoutMs?: number;
}

export interface NativeNavState {
  /** The menu to render — fixed for the session once set. */
  menu: NativeMenu | null;
  /** A newer menu was fetched; it applies at the next launch. */
  updatePending: boolean;
}

async function fetchNativeMenu(
  supabase: Parameters<typeof fetchNavUserContext>[0],
  availableHrefs: ReadonlySet<string>,
): Promise<NativeMenu> {
  const res = await fetch(`${CMS_BASE}/api/nav/native`);
  if (!res.ok) throw new Error(`Native nav request failed (${res.status})`);
  const config = nativeNavConfigSchema.parse(await res.json());
  const mods = config.items
    .filter((i) => i.module)
    .map((i) => ({ slug: i.module ?? "", accessCheck: i.accessCheck }));
  const user: NavUserContext = await fetchNavUserContext(supabase, mods);
  return buildNativeMenu(config, user, availableHrefs);
}

/**
 * The native tab bar + More menu, configured by staff in /admin → Navigation
 * (GET /api/nav/native) and filtered for the signed-in user.
 *
 * Launch order: the cached menu (a pending refresh is promoted first) → on a
 * first launch, the network result (up to `firstLaunchTimeoutMs`) → the
 * bundled fallback. Once a menu is on screen it stays for the session; a
 * different menu fetched later is cached as pending and shown next launch
 * (stable tab bar — Apple HIG; NativeTabs can't change tabs while mounted).
 */
export function useNativeNav(options: UseNativeNavOptions): NativeNavState {
  const { storage, availableHrefs, fallback } = options;
  const timeoutMs = options.firstLaunchTimeoutMs ?? 2500;
  const supabase = useSupabase();
  const { user } = useSession();
  const userId = user?.id;
  const cacheKey = userId ? nativeNavCacheKey(CMS_BASE, userId) : null;

  const [menu, setMenu] = useState<NativeMenu | null>(null);
  const [updatePending, setUpdatePending] = useState(false);
  const [cacheChecked, setCacheChecked] = useState(false);
  const appliedFor = useRef<string | null>(null);

  const query = useQuery({
    queryKey: ["native-nav", userId],
    enabled: !!userId,
    staleTime: 60_000,
    retry: 1,
    queryFn: () => fetchNativeMenu(supabase, availableHrefs),
  });

  // 1. Launch: read the cache for this user.
  useEffect(() => {
    if (!cacheKey || appliedFor.current === cacheKey) return;
    let cancelled = false;
    setCacheChecked(false);
    void loadNativeMenuForLaunch(storage, cacheKey).then((cached) => {
      if (cancelled) return;
      if (cached) {
        appliedFor.current = cacheKey;
        setMenu(cached);
      }
      setCacheChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, storage]);

  // 2. First launch (nothing cached): network result, else fallback on timeout.
  useEffect(() => {
    if (!cacheKey || !cacheChecked || appliedFor.current === cacheKey) return;
    const apply = (next: NativeMenu) => {
      if (appliedFor.current === cacheKey) return;
      appliedFor.current = cacheKey;
      setMenu(next);
      void saveAppliedNativeMenu(storage, cacheKey, next);
    };
    if (query.data) {
      apply(query.data);
      return;
    }
    const applyFallback = () =>
      apply(
        buildNativeMenu(
          fallback,
          { isStaff: false, deniedModules: new Set() },
          availableHrefs,
        ),
      );
    if (query.isError) {
      applyFallback();
      return;
    }
    const timer = setTimeout(applyFallback, timeoutMs);
    return () => clearTimeout(timer);
  }, [
    cacheKey,
    cacheChecked,
    query.data,
    query.isError,
    storage,
    fallback,
    availableHrefs,
    timeoutMs,
  ]);

  // 3. Later fetches: keep a different menu as pending for the next launch.
  useEffect(() => {
    if (!cacheKey || !menu || !query.data) return;
    if (appliedFor.current !== cacheKey) return;
    void recordFetchedNativeMenu(storage, cacheKey, menu, query.data).then(
      setUpdatePending,
    );
  }, [cacheKey, menu, query.data, storage]);

  return { menu, updatePending };
}

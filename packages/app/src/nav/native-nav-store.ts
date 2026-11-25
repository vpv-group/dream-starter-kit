import type { NativeMenu } from "./native-nav";
import { normalizeTabCount, sameNativeMenu } from "./native-nav";

/**
 * Offline cache for the native menu (last known config, per user).
 *
 * Apple's HIG asks for a stable tab bar — tabs shouldn't appear, vanish or
 * move while someone is using the app — and expo-router's NativeTabs can't
 * change its tabs while mounted anyway. So a fresher menu fetched mid-session
 * is stored as `pending` and applied at the next cold start; the menu on
 * screen only changes between launches.
 *
 * Storage is injected (AsyncStorage on native) so this stays platform-free
 * and unit-testable.
 */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

interface StoredNativeNav {
  v: 1;
  current: NativeMenu;
  pending?: NativeMenu;
}

const PREFIX = "native-nav:v1";

/** Cache key for one backend + user (the menu is filtered per user). */
export function nativeNavCacheKey(base: string, userId: string): string {
  return `${PREFIX}:${base}:${userId}`;
}

/**
 * The last applied tab bar, regardless of user — read by the deep-link
 * rewriter (+native-intent), which runs before the session is restored.
 */
export const LAST_TABS_KEY = `${PREFIX}:last-tabs`;

function isMenu(value: unknown): value is NativeMenu {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<NativeMenu>;
  return Array.isArray(m.tabs) && Array.isArray(m.more);
}

async function read(
  storage: KeyValueStorage,
  key: string,
): Promise<StoredNativeNav | null> {
  try {
    const raw = await storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredNativeNav>;
    if (parsed.v !== 1 || !isMenu(parsed.current)) return null;
    return {
      v: 1,
      current: {
        ...parsed.current,
        tabCount: normalizeTabCount(parsed.current.tabCount),
      },
      pending: isMenu(parsed.pending) ? parsed.pending : undefined,
    };
  } catch {
    return null;
  }
}

async function write(
  storage: KeyValueStorage,
  key: string,
  value: StoredNativeNav,
): Promise<void> {
  try {
    await storage.setItem(key, JSON.stringify(value));
    await storage.setItem(LAST_TABS_KEY, JSON.stringify(value.current.tabs));
  } catch {
    // Cache is best-effort; the app still runs on bundled defaults.
  }
}

/**
 * The menu to mount at launch: a pending (newer) menu is promoted to current
 * first. Null when nothing is cached yet (first launch / new user).
 */
export async function loadNativeMenuForLaunch(
  storage: KeyValueStorage,
  key: string,
): Promise<NativeMenu | null> {
  const stored = await read(storage, key);
  if (!stored) return null;
  if (stored.pending) {
    const promoted: StoredNativeNav = { v: 1, current: stored.pending };
    await write(storage, key, promoted);
    return promoted.current;
  }
  return stored.current;
}

/** Store a menu applied right now (first launch, nothing cached yet). */
export async function saveAppliedNativeMenu(
  storage: KeyValueStorage,
  key: string,
  menu: NativeMenu,
): Promise<void> {
  await write(storage, key, { v: 1, current: menu });
}

/**
 * Record a freshly fetched menu while `applied` is on screen: identical →
 * clear any pending; different → keep it as pending for the next launch.
 * Returns true when an update is now pending.
 */
export async function recordFetchedNativeMenu(
  storage: KeyValueStorage,
  key: string,
  applied: NativeMenu,
  fetched: NativeMenu,
): Promise<boolean> {
  const pending = !sameNativeMenu(applied, fetched);
  await write(storage, key, {
    v: 1,
    current: applied,
    ...(pending ? { pending: fetched } : {}),
  });
  return pending;
}

/** Tab hrefs of the last applied menu (for deep-link routing), or []. */
export async function readLastTabHrefs(
  storage: KeyValueStorage,
): Promise<string[]> {
  try {
    const raw = await storage.getItem(LAST_TABS_KEY);
    const tabs = raw ? (JSON.parse(raw) as { href?: unknown }[]) : [];
    return Array.isArray(tabs)
      ? tabs.map((t) => (typeof t.href === "string" ? t.href : ""))
      : [];
  } catch {
    return [];
  }
}

import type { AppSupabaseClient } from "./provider";

/**
 * Work to do while the session still exists, right before signing out — e.g.
 * the notifications module unregistering this device's push token, so the
 * device stops receiving the signed-out account's pushes.
 *
 * Modules can't be imported by host code, so they register here (cross-
 * platform, no DOM/RN imports) and `signOut()` in `@acme/app` runs the hooks.
 * Hooks are best effort: they never block sign-out — each failure is ignored
 * and the whole set is cut off after a timeout.
 */
export type BeforeSignOutHook = (client: AppSupabaseClient) => Promise<void>;

const hooks = new Set<BeforeSignOutHook>();

/** Register a hook; returns a function that removes it. */
export function onBeforeSignOut(hook: BeforeSignOutHook): () => void {
  hooks.add(hook);
  return () => {
    hooks.delete(hook);
  };
}

/** Run every registered hook, settling within `timeoutMs` whatever happens. */
export async function runBeforeSignOutHooks(
  client: AppSupabaseClient,
  timeoutMs = 3000,
): Promise<void> {
  if (hooks.size === 0) return;
  const all = Promise.allSettled(
    [...hooks].map((hook) => {
      try {
        return hook(client);
      } catch (err) {
        return Promise.reject(err instanceof Error ? err : new Error("hook"));
      }
    }),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  await Promise.race([all, timeout]);
  clearTimeout(timer);
}

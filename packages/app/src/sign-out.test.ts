import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppSupabaseClient } from "@acme/api";
import { onBeforeSignOut } from "@acme/api";

import { signOut } from "./auth";

/**
 * `signOut()` runs the before-sign-out hooks modules register (e.g. the
 * notifications module unregistering this device's push token) while the
 * session still exists — and never lets one block or fail the sign-out.
 */

function fakeClient(order: string[]) {
  return {
    auth: {
      signOut: vi.fn(() => {
        order.push("signOut");
        return Promise.resolve({ error: null });
      }),
    },
  } as unknown as AppSupabaseClient;
}

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((off) => off());
  vi.useRealTimers();
});

describe("signOut before-sign-out hooks", () => {
  it("runs hooks before the session ends", async () => {
    const order: string[] = [];
    cleanups.push(
      onBeforeSignOut(() => {
        order.push("hook");
        return Promise.resolve();
      }),
    );
    await signOut(fakeClient(order));
    expect(order).toEqual(["hook", "signOut"]);
  });

  it("signs out even when a hook fails", async () => {
    const order: string[] = [];
    cleanups.push(onBeforeSignOut(() => Promise.reject(new Error("offline"))));
    cleanups.push(
      onBeforeSignOut(() => {
        throw new Error("sync throw");
      }),
    );
    await expect(signOut(fakeClient(order))).resolves.toBeUndefined();
    expect(order).toEqual(["signOut"]);
  });

  it("doesn't wait forever for a hanging hook", async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    cleanups.push(onBeforeSignOut(() => new Promise<void>(() => undefined)));
    const done = signOut(fakeClient(order));
    await vi.advanceTimersByTimeAsync(3000);
    await done;
    expect(order).toEqual(["signOut"]);
  });

  it("stops running a hook once it is removed", async () => {
    const hook = vi.fn(() => Promise.resolve());
    const off = onBeforeSignOut(hook);
    off();
    await signOut(fakeClient([]));
    expect(hook).not.toHaveBeenCalled();
  });
});

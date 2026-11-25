import { describe, expect, it, vi } from "vitest";

import {
  buildTurnstileHtml,
  createCaptchaTokenStore,
  parseTurnstileMessage,
  turnstileBaseUrl,
} from "./captcha";

/** Fake clock: each sleep advances time instantly, optionally running a hook. */
function fakeClock(onTick?: (elapsed: number) => void) {
  let t = 0;
  return {
    now: () => t,
    sleep: (ms: number) => {
      t += ms;
      onTick?.(t);
      return Promise.resolve();
    },
  };
}

describe("createCaptchaTokenStore", () => {
  it("is inert when disabled — resolves undefined without waiting", async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const store = createCaptchaTokenStore({ enabled: false, sleep });
    expect(await store.takeToken()).toBeUndefined();
    expect(await store.getToken()).toBeUndefined();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("hands a token out once, then resets the widget for the next one", async () => {
    const onReset = vi.fn();
    const store = createCaptchaTokenStore({ enabled: true, onReset });
    store.setToken("tok-1");
    expect(await store.takeToken()).toBe("tok-1");
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(store.peek()).toBeUndefined();
  });

  it("waits for a token that arrives after the call", async () => {
    const box: { store?: ReturnType<typeof createCaptchaTokenStore> } = {};
    const clock = fakeClock((elapsed) => {
      if (elapsed >= 600) box.store?.setToken("late");
    });
    const store = createCaptchaTokenStore({ enabled: true, ...clock });
    box.store = store;
    expect(await store.takeToken()).toBe("late");
  });

  it("two calls in a row get two distinct tokens", async () => {
    let n = 0;
    const box: { store?: ReturnType<typeof createCaptchaTokenStore> } = {};
    // The widget mints a new token shortly after each reset.
    const clock = fakeClock(() => {
      if (box.store && !box.store.peek()) box.store.setToken(`tok-${++n}`);
    });
    const store = createCaptchaTokenStore({ enabled: true, ...clock });
    box.store = store;
    const a = await store.takeToken();
    const b = await store.takeToken();
    expect(a).toBe("tok-1");
    expect(b).toBe("tok-2");
  });

  it("gives up at the timeout when nothing solves", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const clock = fakeClock();
    const store = createCaptchaTokenStore({ enabled: true, ...clock });
    expect(await store.takeToken(1_000)).toBeUndefined();
    expect(clock.now()).toBeGreaterThanOrEqual(1_000);
    expect(clock.now()).toBeLessThan(2_000);
    warn.mockRestore();
  });

  it("keeps waiting past the timeout while a challenge is on screen", async () => {
    const box: { store?: ReturnType<typeof createCaptchaTokenStore> } = {};
    const clock = fakeClock((elapsed) => {
      if (elapsed === 150) box.store?.setInteractive(true);
      if (elapsed >= 30_000) box.store?.setToken("clicked");
    });
    const store = createCaptchaTokenStore({ enabled: true, ...clock });
    box.store = store;
    expect(await store.takeToken(1_000)).toBe("clicked");
  });
});

describe("turnstile WebView helpers", () => {
  it("derives the WebView base URL from the site origin", () => {
    expect(turnstileBaseUrl("https://future.dev")).toBe("https://future.dev/");
    expect(turnstileBaseUrl("https://future.dev/some/path?x=1")).toBe(
      "https://future.dev/",
    );
    expect(turnstileBaseUrl("http://localhost:3000")).toBe(
      "http://localhost:3000/",
    );
  });

  it("renders an interaction-only widget with the site key", () => {
    const html = buildTurnstileHtml("0xABC");
    expect(html).toContain('sitekey: "0xABC"');
    expect(html).toContain('appearance: "interaction-only"');
    expect(html).toContain("before-interactive-callback");
    expect(html).toContain("challenges.cloudflare.com/turnstile/v0/api.js");
    expect(html).not.toContain('"invisible"');
  });

  it("escapes a site key that tries to break out of the script tag", () => {
    const html = buildTurnstileHtml("</script><script>alert(1)</script>");
    expect(html).not.toContain("</script><script>alert(1)");
  });

  it("parses known messages and rejects junk", () => {
    expect(parseTurnstileMessage('{"type":"token","token":"t"}')).toEqual({
      type: "token",
      token: "t",
    });
    expect(parseTurnstileMessage('{"type":"error","code":110200}')).toEqual({
      type: "error",
      code: "110200",
    });
    expect(parseTurnstileMessage('{"type":"interactive"}')).toEqual({
      type: "interactive",
    });
    expect(parseTurnstileMessage('{"type":"token","token":""}')).toBeNull();
    expect(parseTurnstileMessage('{"type":"nope"}')).toBeNull();
    expect(parseTurnstileMessage("not json")).toBeNull();
    expect(parseTurnstileMessage("null")).toBeNull();
  });
});

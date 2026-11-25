/**
 * Platform-agnostic Cloudflare Turnstile plumbing (Supabase built-in CAPTCHA —
 * see docs/TURNSTILE.md). Pure logic only, so it's unit-tested under vitest and
 * safe for Metro: the token store backs the native `CaptchaProvider`
 * (apps/expo/src/lib/captcha.tsx), and the HTML/message helpers drive the
 * WebView that hosts the widget on iOS/Android. The web app keeps its own
 * `@marsidev/react-turnstile` provider with the same `takeToken()` semantics.
 */

/** Messages the Turnstile WebView page posts back to React Native. */
export type TurnstileMessage =
  | { type: "token"; token: string }
  | { type: "expired" }
  | { type: "error"; code: string }
  | { type: "interactive" }
  | { type: "interactive-done" }
  | { type: "unsupported" };

/** JS run inside the WebView to mint a fresh token after one is consumed. */
export const TURNSTILE_RESET_JS =
  "window.__turnstileReset && window.__turnstileReset(); true;";

/**
 * The WebView's document origin. Turnstile checks the embedding page's hostname
 * against the widget's Hostname list, so the page must be served "from" the
 * web app's origin (WebView `source.baseUrl`) — not `about:blank`. Pass the
 * app's configured site URL (EXPO_PUBLIC_API_URL → `clientEnv.APP_URL`).
 */
export function turnstileBaseUrl(siteUrl: string): string {
  return `${new URL(siteUrl).origin}/`;
}

/**
 * The tiny HTML page the WebView renders: loads Turnstile's api.js, renders one
 * `interaction-only` widget (invisible while Cloudflare solves silently, a
 * clickable checkbox only when it demands interaction — never size
 * "invisible", which makes Managed challenges unsolvable), and posts every
 * lifecycle event to React Native as a JSON `TurnstileMessage`.
 */
export function buildTurnstileHtml(siteKey: string): string {
  // JSON-encode, then neutralize `<` so a hostile value can't close the <script>.
  const key = JSON.stringify(siteKey).replace(/</g, "\\u003c");
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
html,body{margin:0;padding:0;height:100%;background:transparent;overflow:hidden}
body{display:flex;align-items:center;justify-content:center}
</style>
<script>
(function(){
  var widgetId;
  function post(msg){
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }
  window.__turnstileReset = function(){
    if (window.turnstile && widgetId !== undefined) window.turnstile.reset(widgetId);
  };
  window.__onTurnstileLoad = function(){
    widgetId = window.turnstile.render("#turnstile", {
      sitekey: ${key},
      appearance: "interaction-only",
      size: "normal",
      callback: function(token){ post({ type: "token", token: token }); },
      "expired-callback": function(){ post({ type: "expired" }); window.__turnstileReset(); },
      "error-callback": function(code){ post({ type: "error", code: String(code) }); return true; },
      "before-interactive-callback": function(){ post({ type: "interactive" }); },
      "after-interactive-callback": function(){ post({ type: "interactive-done" }); },
      "unsupported-callback": function(){ post({ type: "unsupported" }); }
    });
  };
})();
</script>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__onTurnstileLoad&render=explicit" async defer></script>
</head>
<body><div id="turnstile"></div></body>
</html>`;
}

/** Parse a WebView `postMessage` payload; returns null for anything unexpected. */
export function parseTurnstileMessage(raw: string): TurnstileMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const msg = data as Record<string, unknown>;
  switch (msg.type) {
    case "token":
      return typeof msg.token === "string" && msg.token
        ? { type: "token", token: msg.token }
        : null;
    case "error":
      return { type: "error", code: String(msg.code) };
    case "expired":
    case "interactive":
    case "interactive-done":
    case "unsupported":
      return { type: msg.type };
    default:
      return null;
  }
}

export interface CaptchaTokenStore {
  /** True when a site key is configured (a token WILL eventually exist). */
  readonly enabled: boolean;
  /** Latest unconsumed token, if any. */
  peek: () => string | undefined;
  setToken: (token: string | undefined) => void;
  /** Cloudflare is showing a challenge the user must click — keep waiting. */
  setInteractive: (interactive: boolean) => void;
  /** Wait (bounded) for a token without consuming it. */
  getToken: (timeoutMs?: number) => Promise<string | undefined>;
  /**
   * Wait for a token, hand it out ONCE, and immediately start minting the
   * next. One call per gated auth request (tokens are single-use).
   */
  takeToken: (timeoutMs?: number) => Promise<string | undefined>;
  /** Drop the current token and ask the widget for a fresh one. */
  reset: () => void;
}

/**
 * The `getToken` / `takeToken` / `reset` state machine shared by CAPTCHA
 * providers. `enabled: false` makes it inert — every getter resolves
 * undefined immediately, so callers pass that straight through and CAPTCHA is
 * simply off. `onReset` asks the widget to mint a fresh token.
 */
export function createCaptchaTokenStore(opts: {
  enabled: boolean;
  onReset?: () => void;
  /** Default wait for a silent solve before giving up. */
  defaultTimeoutMs?: number;
  /** Upper bound while an interactive challenge is on screen. */
  interactiveTimeoutMs?: number;
  pollMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): CaptchaTokenStore {
  const {
    enabled,
    onReset,
    defaultTimeoutMs = 8_000,
    interactiveTimeoutMs = 120_000,
    pollMs = 150,
    now = Date.now,
    sleep = (ms) => new Promise<void>((r) => setTimeout(r, ms)),
  } = opts;
  let token: string | undefined;
  let interactive = false;

  const getToken = async (timeoutMs = defaultTimeoutMs) => {
    if (!enabled) return undefined;
    const start = now();
    const deadline = start + timeoutMs;
    const hardDeadline = start + Math.max(timeoutMs, interactiveTimeoutMs);
    while (
      !token &&
      (now() < deadline || (interactive && now() < hardDeadline))
    ) {
      await sleep(pollMs);
    }
    if (!token) {
      console.warn(
        "[captcha] no Turnstile token — the widget did not solve in time",
      );
    }
    return token;
  };

  const reset = () => {
    token = undefined;
    onReset?.();
  };

  return {
    enabled,
    peek: () => token,
    setToken: (t) => {
      token = t;
      if (t) interactive = false;
    },
    setInteractive: (v) => {
      interactive = v;
    },
    getToken,
    takeToken: async (timeoutMs) => {
      const t = await getToken(timeoutMs);
      if (t) reset();
      return t;
    },
    reset,
  };
}

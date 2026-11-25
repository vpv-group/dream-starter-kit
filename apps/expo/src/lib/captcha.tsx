// Native Cloudflare Turnstile token source (Supabase built-in CAPTCHA — see
// docs/TURNSTILE.md). Mirrors the web CaptchaProvider
// (apps/nextjs/src/components/captcha/captcha-provider.tsx): ONE widget,
// `appearance: "interaction-only"`, and a `takeToken()` that waits for a token,
// hands it out once, then resets the widget — tokens are single-use, so two
// auth calls in a row need two takeToken() calls.
//
// React Native has no DOM, so the widget runs inside a react-native-webview
// rendering a tiny HTML page (`buildTurnstileHtml`) that postMessages each
// token back. The page's `baseUrl` is the web app's origin (EXPO_PUBLIC_API_URL)
// so Turnstile's hostname check passes — the widget only lists the site's
// hostname(s). The WebView sits offscreen while Cloudflare solves silently and
// is shown in a small sheet only when it demands interaction
// (`before-interactive-callback`).
//
// When EXPO_PUBLIC_TURNSTILE_SITE_KEY is unset the provider is inert: no
// WebView is mounted and takeToken() resolves undefined — callers pass that
// straight through and CAPTCHA is simply off.
//
// react-native-webview is a NATIVE module: adding it requires a new EAS build
// (a JS-only OTA update or an older dev client won't have it).
import type { WebViewMessageEvent } from "react-native-webview";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

import {
  buildTurnstileHtml,
  createCaptchaTokenStore,
  parseTurnstileMessage,
  TURNSTILE_RESET_JS,
  turnstileBaseUrl,
} from "@acme/app";
import { Text } from "@acme/ui-native/text";

interface CaptchaContextValue {
  /** True when a site key is configured (a token WILL eventually exist). */
  enabled: boolean;
  /** Wait (bounded) for the current token without consuming it. */
  getToken: (timeoutMs?: number) => Promise<string | undefined>;
  /**
   * Wait for a token, hand it out ONCE, and immediately start minting the
   * next. Use for every gated auth request.
   */
  takeToken: (timeoutMs?: number) => Promise<string | undefined>;
  /** Drop the current token and mint a fresh one. */
  reset: () => void;
}

const inert: CaptchaContextValue = {
  enabled: false,
  getToken: () => Promise.resolve(undefined),
  takeToken: () => Promise.resolve(undefined),
  reset: () => undefined,
};

const CaptchaContext = createContext<CaptchaContextValue>(inert);

export function useCaptcha(): CaptchaContextValue {
  return useContext(CaptchaContext);
}

// Turnstile's "normal" widget is 300×65; leave a little room.
const WIDGET_WIDTH = 304;
const WIDGET_HEIGHT = 72;
// The WebView has to boot and fetch api.js before the first solve — allow a
// bit longer than the web default (8s) on a cold mobile connection.
const DEFAULT_TIMEOUT_MS = 15_000;

export function CaptchaProvider({
  siteKey,
  siteUrl,
  children,
}: {
  /** EXPO_PUBLIC_TURNSTILE_SITE_KEY; when empty the provider is inert. */
  siteKey?: string;
  /** Web app origin (clientEnv.APP_URL) — the WebView's document origin. */
  siteUrl: string;
  children: React.ReactNode;
}) {
  const [interactive, setInteractive] = useState(false);

  // The site key is inlined at build time, so one store per mount is enough.
  // The WebView handle lives in a plain holder created alongside the store (a
  // stable object React fills via `ref`), read only from the store's reset
  // callback — never during render.
  const [{ store, webview }] = useState(() => {
    // react-native-webview 14 defaults WebView's extra-props generic to
    // `undefined` (`WebViewProps & undefined` = never), so pin it to `object`.
    const holder: { current: WebView<object> | null } = { current: null };
    return {
      webview: holder,
      store: createCaptchaTokenStore({
        enabled: Boolean(siteKey),
        defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
        onReset: () => holder.current?.injectJavaScript(TURNSTILE_RESET_JS),
      }),
    };
  });

  const markInteractive = useCallback(
    (v: boolean) => {
      store.setInteractive(v);
      setInteractive(v);
    },
    [store],
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const msg = parseTurnstileMessage(event.nativeEvent.data);
      if (!msg) return;
      switch (msg.type) {
        case "token":
          store.setToken(msg.token);
          markInteractive(false);
          break;
        case "expired":
          // The page resets the widget itself; just forget the stale token.
          store.setToken(undefined);
          break;
        case "interactive":
          markInteractive(true);
          break;
        case "interactive-done":
          markInteractive(false);
          break;
        case "error":
          store.setToken(undefined);
          markInteractive(false);
          // Cloudflare error codes: 110200 = hostname not allowed for this
          // site key (check EXPO_PUBLIC_API_URL's host is in the widget's
          // Hostname list); 1101xx = invalid site key; 300xxx/600xxx =
          // challenge failed.
          console.warn(`[captcha] Turnstile error ${msg.code}`);
          break;
        case "unsupported":
          console.warn("[captcha] Turnstile unsupported in this WebView");
          break;
      }
    },
    [store, markInteractive],
  );

  const cancelChallenge = useCallback(() => {
    // Stop holding waiting callers open; they time out and surface an error.
    markInteractive(false);
    store.reset();
  }, [store, markInteractive]);

  const value = useMemo<CaptchaContextValue>(
    () =>
      store.enabled
        ? {
            enabled: true,
            getToken: store.getToken,
            takeToken: store.takeToken,
            reset: store.reset,
          }
        : inert,
    [store],
  );

  const source = useMemo(
    () =>
      siteKey
        ? {
            html: buildTurnstileHtml(siteKey),
            baseUrl: turnstileBaseUrl(siteUrl),
          }
        : undefined,
    [siteKey, siteUrl],
  );

  return (
    <CaptchaContext.Provider value={value}>
      {children}
      {source && (
        // One stable tree: only styles change between offscreen and visible,
        // so the WebView is never remounted (which would restart the solve).
        <View
          style={interactive ? styles.overlay : styles.offscreen}
          pointerEvents={interactive ? "auto" : "none"}
        >
          <View
            className={interactive ? "bg-background rounded-xl" : undefined}
            style={interactive ? styles.sheet : undefined}
          >
            {interactive && (
              <Text className="mb-2 text-center font-medium">
                Quick security check
              </Text>
            )}
            <WebView<object>
              ref={webview}
              source={source}
              originWhitelist={["*"]}
              javaScriptEnabled
              domStorageEnabled
              scrollEnabled={false}
              setSupportMultipleWindows={false}
              style={styles.webview}
              containerStyle={styles.webview}
              onMessage={onMessage}
              onContentProcessDidTerminate={() => webview.current?.reload()}
              onRenderProcessGone={() => webview.current?.reload()}
            />
            {interactive && (
              <Pressable onPress={cancelChallenge} className="mt-2 py-2">
                <Text className="text-muted-foreground text-center text-sm">
                  Cancel
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </CaptchaContext.Provider>
  );
}

const styles = StyleSheet.create({
  offscreen: {
    position: "absolute",
    left: -10_000,
    top: 0,
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
    opacity: 0,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 48,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    padding: 16,
  },
  webview: {
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
    backgroundColor: "transparent",
    flexGrow: 0,
  },
});

"use client";

// Cloudflare Turnstile token provider (Supabase built-in CAPTCHA — see
// docs/TURNSTILE.md and https://supabase.com/docs/guides/auth/auth-captcha).
//
// Renders one invisible Turnstile widget for the whole app; it solves silently
// on load and keeps `token` fresh (auto-refresh on expiry). Auth calls read
// `token` and pass it as `options.captchaToken`, then call `reset()` (tokens are
// single-use). When no site key is set the provider is inert and `token` is
// undefined — callers pass that straight through and CAPTCHA is simply off.
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { useMemo, useRef, useState } from "react";
import { Turnstile } from "@marsidev/react-turnstile";

import type { CaptchaContextValue } from "@acme/app";
import { CaptchaContext, useCaptcha } from "@acme/app";

// The context lives in @acme/app so module UI can read the token too.
export { useCaptcha };

export function CaptchaProvider({
  siteKey,
  children,
}: {
  /** NEXT_PUBLIC_TURNSTILE_SITE_KEY; when empty the provider is inert. */
  siteKey?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<TurnstileInstance | undefined>(undefined);
  const [token, setToken] = useState<string>();

  const value = useMemo<CaptchaContextValue>(
    () => ({ token, reset: () => ref.current?.reset() }),
    [token],
  );

  return (
    <CaptchaContext.Provider value={value}>
      {children}
      {siteKey && (
        <Turnstile
          ref={ref}
          siteKey={siteKey}
          options={{ size: "invisible" }}
          onSuccess={setToken}
          onExpire={() => ref.current?.reset()}
          onError={() => setToken(undefined)}
        />
      )}
    </CaptchaContext.Provider>
  );
}

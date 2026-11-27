"use client";

import { createContext, useContext } from "react";

/**
 * The CAPTCHA token for auth calls (docs/TURNSTILE.md), as a platform-neutral
 * context: the web host's `CaptchaProvider` renders the Turnstile widget and
 * provides this value; modules (e.g. billing's paywall, which mints an
 * anonymous session) read it with `useCaptcha()` without importing the host.
 * Outside a provider CAPTCHA is simply off (`token` undefined).
 */
export interface CaptchaContextValue {
  /** Latest token, or undefined when CAPTCHA is disabled / not ready. */
  token?: string;
  /** Mint a fresh token after using one (tokens are single-use). */
  reset: () => void;
}

export const CaptchaContext = createContext<CaptchaContextValue>({
  reset: () => undefined,
});

export function useCaptcha(): CaptchaContextValue {
  return useContext(CaptchaContext);
}

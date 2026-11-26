"use client";

import { createContext, useContext } from "react";

/**
 * The Turnstile token a platform's `CaptchaProvider` keeps fresh (web:
 * apps/nextjs/src/components/captcha/captcha-provider.tsx). Shared here so
 * module UI (e.g. a feedback vote button that mints an anonymous session)
 * can read it without importing app code. `token` is undefined when CAPTCHA
 * is off or not solved yet; call `reset()` after using one (single-use).
 */
export interface CaptchaContextValue {
  token?: string;
  reset: () => void;
}

export const CaptchaContext = createContext<CaptchaContextValue>({
  reset: () => undefined,
});

export function useCaptcha(): CaptchaContextValue {
  return useContext(CaptchaContext);
}

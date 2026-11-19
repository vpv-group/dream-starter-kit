import type { ChooserEntry } from "@acme/app";

/**
 * "You used {method} last time" (Linear-style) — a first-party, non-sensitive
 * cookie remembering which sign-in entry was used on this browser. Read on the
 * client after mount (no hydration mismatch); never sent anywhere else.
 */
const COOKIE = "last_auth_method";
const ONE_YEAR = 60 * 60 * 24 * 365;
const ENTRIES: readonly ChooserEntry[] = ["email", "google", "apple", "sso"];

export const LAST_USED_LABEL: Record<ChooserEntry, string> = {
  email: "email",
  google: "Google",
  apple: "Apple",
  sso: "SSO",
};

export function readLastUsedMethod(): ChooserEntry | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${COOKIE}=`));
  const value = match?.slice(COOKIE.length + 1);
  return ENTRIES.find((e) => e === value) ?? null;
}

export function rememberLastUsedMethod(entry: ChooserEntry): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE}=${entry}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

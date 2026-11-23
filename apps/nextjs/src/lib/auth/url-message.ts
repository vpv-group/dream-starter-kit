/**
 * Auth status carried in a URL, shown once as a toast by `<AuthUrlMessage />`.
 *
 * - Supabase Auth (GoTrue) reports the outcome of its redirect-style email
 *   links in the URL it redirects to: `?message=…#message=…&sb=` on success
 *   (e.g. the first of the two secure-email-change links), or
 *   `#error=…&error_code=…&error_description=…` on failure. The kit's own
 *   email templates verify through `/confirm-email` instead, but a hosted
 *   project still on Supabase's default templates lands with only these.
 * - The kit's own `?notice=<key>` (e.g. `email-changed`, set as the
 *   email-change `emailRedirectTo`, so it only arrives once BOTH links are
 *   confirmed).
 *
 * Only ALLOWLISTED copy is ever shown: the URL is attacker-controlled, so
 * unknown `message`/`notice` values and every `error_description` are
 * stripped without being rendered (no arbitrary text on our domain).
 */

/**
 * Params this parser owns; only these are stripped (tokens/`code` are kept).
 * A bare `?error=` is NOT ours — the app uses it on /sign-in and the invite
 * pages — so `error` is only stripped alongside GoTrue's `error_code` /
 * `error_description`.
 */
const OWNED_KEYS = [
  "message",
  "sb",
  "error_code",
  "error_description",
  "notice",
] as const;

/** GoTrue `message` values we show, with our copy. */
const GOTRUE_MESSAGES: Record<string, string> = {
  "Confirmation link accepted. Please proceed to confirm link sent to the other email":
    "Confirmation link accepted. Open the link we sent to your other email address to finish changing it.",
};

/** The kit's `?notice=` keys. */
export const NOTICES = {
  "email-changed":
    "Email address changed. Use your new address to sign in from now on.",
} as const;

export type NoticeKey = keyof typeof NOTICES;

/** GoTrue `error_code` → our copy (anything else gets the generic line). */
const ERROR_COPY: Record<string, string> = {
  otp_expired: "That email link is invalid or has expired. Request a new one.",
};
const GENERIC_ERROR = "That link didn’t work. Please try again.";

export interface AuthUrlMessage {
  /** `null` when the URL only had params to strip (unknown values). */
  toast: { kind: "success" | "error"; text: string } | null;
  /** `search` with the owned params removed ("" or "?…"). */
  search: string;
  /** `hash` with the owned params removed ("" or "#…"). */
  hash: string;
}

const strip = (
  params: URLSearchParams,
  prefix: "?" | "#",
  gotrueError: boolean,
) => {
  for (const key of OWNED_KEYS) params.delete(key);
  if (gotrueError) params.delete("error");
  const rest = params.toString();
  return rest ? `${prefix}${rest}` : "";
};

/**
 * Reads the status params from a URL's `search` + `hash` (GoTrue writes
 * `message` to both — one result). Returns `null` when none are present.
 * An error wins over a success notice (an expired 2nd email-change link
 * redirects to `…?notice=email-changed#error=…`).
 */
export function parseAuthUrlMessage(
  search: string,
  hash: string,
): AuthUrlMessage | null {
  const query = new URLSearchParams(search.replace(/^\?/, ""));
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const has = (key: string) => fragment.has(key) || query.has(key);
  if (!OWNED_KEYS.some(has)) return null;
  const get = (key: string) =>
    (fragment.get(key) ?? query.get(key))?.trim() ?? "";

  const gotrueError = has("error_code") || has("error_description");
  let toast: AuthUrlMessage["toast"] = null;
  if (gotrueError) {
    const code = get("error_code");
    toast = {
      kind: "error",
      text:
        (Object.hasOwn(ERROR_COPY, code) ? ERROR_COPY[code] : undefined) ??
        GENERIC_ERROR,
    };
  } else {
    const notice = get("notice");
    const message = get("message");
    const text = Object.hasOwn(NOTICES, notice)
      ? NOTICES[notice as NoticeKey]
      : Object.hasOwn(GOTRUE_MESSAGES, message)
        ? GOTRUE_MESSAGES[message]
        : undefined;
    if (text) toast = { kind: "success", text };
  }

  return {
    toast,
    search: strip(query, "?", gotrueError),
    hash: strip(fragment, "#", gotrueError),
  };
}

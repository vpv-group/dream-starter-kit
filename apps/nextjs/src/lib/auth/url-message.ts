/**
 * Supabase Auth (GoTrue) reports the outcome of its redirect-style email links
 * in the URL it redirects to: `?message=…#message=…&sb=` on success (e.g. the
 * first of the two secure-email-change links), or
 * `#error=…&error_code=…&error_description=…` on failure. The kit's own email
 * templates verify through `/confirm-email` instead, but a hosted project still
 * on Supabase's default templates lands on the Site URL with only these params —
 * `<AuthUrlMessage />` surfaces them as a toast and strips them.
 */

/** Params GoTrue appends; only these are stripped (tokens etc. are kept). */
const GOTRUE_KEYS = [
  "message",
  "sb",
  "error",
  "error_code",
  "error_description",
] as const;

/** Friendlier copy for GoTrue messages we know; anything else shows verbatim. */
const FRIENDLY: Record<string, string> = {
  "Confirmation link accepted. Please proceed to confirm link sent to the other email":
    "Confirmation link accepted. Open the link we sent to your other email address to finish changing it.",
};

export interface AuthUrlMessage {
  kind: "success" | "error";
  text: string;
  /** `search` with GoTrue's params removed ("" or "?…"). */
  search: string;
  /** `hash` with GoTrue's params removed ("" or "#…"). */
  hash: string;
}

const strip = (params: URLSearchParams, prefix: "?" | "#") => {
  for (const key of GOTRUE_KEYS) params.delete(key);
  const rest = params.toString();
  return rest ? `${prefix}${rest}` : "";
};

/**
 * Reads GoTrue's status params from a URL's `search` + `hash` (both may carry
 * them — GoTrue writes `message` to each, so it yields one result). Returns
 * `null` when there's nothing to show.
 */
export function parseAuthUrlMessage(
  search: string,
  hash: string,
): AuthUrlMessage | null {
  const query = new URLSearchParams(search.replace(/^\?/, ""));
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const get = (key: string) =>
    (fragment.get(key) ?? query.get(key))?.trim() ?? "";

  const error = get("error_description");
  const message = get("message");
  if (!error && !message) return null;

  return {
    kind: error ? "error" : "success",
    text: error || (FRIENDLY[message] ?? message),
    search: strip(query, "?"),
    hash: strip(fragment, "#"),
  };
}

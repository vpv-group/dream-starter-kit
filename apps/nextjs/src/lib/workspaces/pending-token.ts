/**
 * Carries an invite / join-link token through sign-in, sign-up and email
 * confirmation (which all end at /welcome but can't keep a query param across
 * the emailed-link hop). Set by /invite/[token]/continue and
 * /join/[token]/continue, read and cleared by /welcome. httpOnly, 1 day.
 */
export const PENDING_TOKEN_COOKIE = "pending_workspace_token";
export const PENDING_TOKEN_MAX_AGE = 60 * 60 * 24;

/** Opaque URL-safe tokens (create_invitations / reset_join_link emit 43 chars). */
export const WORKSPACE_TOKEN_RE = /^[A-Za-z0-9_-]{16,256}$/;

export interface PendingToken {
  kind: "invite" | "join";
  value: string;
}

export function encodePendingToken(token: PendingToken): string {
  return `${token.kind}:${token.value}`;
}

export function decodePendingToken(
  raw: string | undefined | null,
): PendingToken | null {
  if (!raw) return null;
  const [kind, value] = raw.split(":", 2);
  if ((kind !== "invite" && kind !== "join") || !value) return null;
  return WORKSPACE_TOKEN_RE.test(value) ? { kind, value } : null;
}

/** /invite/{token} (absolute or path) → token, for /accept-invite's redirect_to. */
export function inviteTokenFromRedirect(
  redirectTo: string | null,
  origin: string,
): string | null {
  if (!redirectTo) return null;
  try {
    const url = new URL(redirectTo, origin);
    if (url.origin !== origin) return null;
    const match = /^\/invite\/([A-Za-z0-9_-]{16,256})\/?$/.exec(url.pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

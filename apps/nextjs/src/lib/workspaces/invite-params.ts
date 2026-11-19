/**
 * JoinSignIn: /invite/[token]/continue sends signed-out invitees to
 * /sign-in?invite=1&email=…&ws=… so the auth form locks the invited address and
 * says "Join {workspace}". Display-only: acceptance re-checks the confirmed
 * email server-side.
 */
export function readInviteParams(
  params: Record<string, string | string[] | undefined>,
): { lockedEmail?: string; workspaceName?: string } {
  const one = (v: string | string[] | undefined) =>
    typeof v === "string" ? v.trim() : undefined;
  if (one(params.invite) !== "1") return {};
  const email = one(params.email);
  const ws = one(params.ws);
  return {
    lockedEmail: email && /^[^@\s]+@[^@\s]+$/.test(email) ? email : undefined,
    workspaceName: ws ? ws.slice(0, 64) : undefined,
  };
}

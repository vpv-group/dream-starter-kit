"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { createClient } from "~/lib/supabase/client";

/**
 * Mirror the just-confirmed user into Payload's `users` collection via the host
 * endpoint. Best-effort and idempotent — backstopped by the (app) layout and
 * `cms:backfill-users`.
 */
async function mirrorSelf(): Promise<void> {
  try {
    await fetch("/api/cms/mirror-self", { method: "POST" });
  } catch {
    /* best-effort */
  }
}

/**
 * The same-origin path to continue to after confirming. `next` is a relative
 * path; `redirect_to` is the caller's full `emailRedirectTo` URL (the kit's
 * email_change template carries it). Cross-origin / protocol-relative targets
 * are ignored (open-redirect guard). A `redirect_to` that points back at this
 * page (the paywall conversion's `/confirm-email?next=…`) is unwrapped.
 */
function continueTo(query: URLSearchParams, fallback: string): string {
  const isPath = (v: string | null): v is string =>
    !!v && /^\/(?!\/)/.test(v) && !v.startsWith("/\\");
  const nextParam = query.get("next");
  if (isPath(nextParam)) return nextParam;
  const redirectTo = query.get("redirect_to");
  if (redirectTo) {
    try {
      const url = new URL(redirectTo, window.location.origin);
      if (url.origin === window.location.origin) {
        if (url.pathname === "/confirm-email") {
          const inner = url.searchParams.get("next");
          if (isPath(inner)) return inner;
        } else {
          return url.pathname + url.search;
        }
      }
    } catch {
      /* malformed — fall through */
    }
  }
  return fallback;
}

/**
 * Sign-up confirmation landing page. The kit's confirmation email template
 * (supabase/templates/confirmation.html) links here with `?token_hash=…`,
 * verified by an explicit `verifyOtp(type: "signup")` call.
 *
 * Why not GoTrue's {{ .ConfirmationURL }} redirect flow: re-sent confirmations
 * (supabase.auth.resend — used by /check-email, /profile, and unconfirmed
 * sign-in recovery) carry NO PKCE state, so their links redirect with
 * implicit-flow hash tokens that a server route can never read. Verifying a
 * token_hash from page JS works identically for original and re-sent emails,
 * from any browser/device, and keeps the one-time token out of the navigation
 * redirect chain (mail-scanner prefetch / Critical-CH navigation restarts
 * can't burn it — same reasoning as /accept-invite).
 *
 * On success we hard-navigate to /welcome (the server must re-read the fresh
 * auth cookie), which routes the founder into /cms-setup and everyone else to
 * /a.
 *
 * Email changes (`type=email_change`, supabase/templates/email_change.html):
 * with "Secure email change" on, Supabase emails a link to BOTH the old and the
 * new address. Verifying the first one succeeds WITHOUT a session (GoTrue's
 * "confirmation link accepted, confirm the other one" state) — we say so
 * instead of redirecting. The second returns a session carrying the new email;
 * we mirror it into the CMS and continue to /profile (or `redirect_to`).
 */
export default function ConfirmEmailPage() {
  const [supabase] = useState(createClient);
  const [status, setStatus] = useState<
    "loading" | "invalid" | "email-change-pending" | "email-change-invalid"
  >("loading");
  // One-time tokens must be verified exactly once — guard against React 18
  // StrictMode's dev-only double effect run (a second verifyOtp would 403).
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    async function confirm() {
      const query = new URLSearchParams(window.location.search);
      const tokenHash = query.get("token_hash");
      // Anonymous→permanent conversions (updateUser email) link with
      // `type=email_change`; sign-ups with `type=signup`. Honor whichever.
      const type = query.get("type") ?? "signup";
      const isEmailChange = type === "email_change";
      // Conversions pass `?next=<origin>` to return the buyer to where they
      // started (a paid, now-permanent user). Same-origin relative paths only
      // (open-redirect guard); default to /welcome (routes by role), or back to
      // /profile for an account-settings email change.
      const next = continueTo(query, isEmailChange ? "/profile" : "/welcome");
      history.replaceState(null, "", window.location.pathname);

      if (tokenHash) {
        const { data, error } = await supabase.auth.verifyOtp({
          type,
          token_hash: tokenHash,
        });
        if (!error && isEmailChange && !data.session) {
          // First of the two secure-email-change links: accepted, but the
          // change only applies once the other address confirms too.
          setStatus("email-change-pending");
          return;
        }
        if (!error) {
          // Mirror into Payload's `users` collection. The sign-up `next` is
          // /welcome (which mirrors), but the anon→permanent conversion `next`
          // is the buyer's origin page — that path never reaches /welcome, so
          // do it here. Best-effort, idempotent.
          await mirrorSelf();
          window.location.assign(next);
          return;
        }
        // Token used/expired — an earlier visit may have already confirmed.
        // For an email change, don't silently bounce a signed-in user to
        // /profile as if it worked: say the link is no good.
        if (isEmailChange) {
          setStatus("email-change-invalid");
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        await mirrorSelf();
        window.location.assign(next);
        return;
      }
      setStatus("invalid");
    }

    void confirm();
  }, [supabase]);

  if (status === "loading") {
    return (
      <p className="text-muted-foreground text-center text-sm">
        Confirming your email…
      </p>
    );
  }

  if (status === "email-change-pending") {
    return (
      <div className="flex flex-col gap-4 text-center">
        <h1 className="text-2xl font-semibold">One more step</h1>
        <p className="text-muted-foreground text-sm">
          This address is confirmed. To finish changing your email, also open
          the confirmation link we sent to your other email address. Your email
          stays the same until both are confirmed.
        </p>
        <p className="text-sm">
          <Link href="/profile">Back to your account</Link>
        </p>
      </div>
    );
  }

  if (status === "email-change-invalid") {
    return (
      <div className="flex flex-col gap-4 text-center">
        <h1 className="text-2xl font-semibold">Link invalid or expired</h1>
        <p className="text-muted-foreground text-sm">
          This email-change link is invalid, has expired, or was already used.
          You can re-send it — or request a new change — from{" "}
          <Link href="/profile">your account</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 text-center">
      <h1 className="text-2xl font-semibold">Link invalid or expired</h1>
      <p className="text-muted-foreground text-sm">
        This confirmation link is invalid or has expired.{" "}
        <Link href="/check-email">Request a new one</Link>, or{" "}
        <Link href="/sign-in">sign in</Link> if your email is already confirmed.
      </p>
    </div>
  );
}

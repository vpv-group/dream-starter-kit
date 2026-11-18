"use client";

import { useState } from "react";

import { signOut } from "@acme/app";

import { createClient } from "~/lib/supabase/client";

/** "Signed in as {email} · Use a different email" — signs out, back to sign-up. */
export function UseDifferentEmail({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <span>
      Signed in as <span className="text-foreground">{email}</span> ·{" "}
      <button
        type="button"
        disabled={busy}
        className="text-primary underline underline-offset-4 disabled:opacity-50"
        onClick={() => {
          setBusy(true);
          void signOut(createClient()).finally(() =>
            window.location.assign("/sign-up"),
          );
        }}
      >
        Use a different email
      </button>
    </span>
  );
}

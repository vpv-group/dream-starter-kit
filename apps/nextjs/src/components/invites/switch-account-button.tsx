"use client";

import { useState } from "react";

import { signOut } from "@acme/app";

import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { createClient } from "~/lib/supabase/client";

/** Sign out, then come back to `returnTo` (the invite page) signed out. */
export function SwitchAccountButton({
  returnTo,
  variant = "default",
  children = "Switch account",
}: {
  returnTo: string;
  variant?: "default" | "secondary" | "outline";
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      size="lg"
      className="w-full"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signOut(createClient()).finally(() =>
          window.location.assign(returnTo),
        );
      }}
    >
      {busy ? <Spinner /> : null}
      {children}
    </Button>
  );
}

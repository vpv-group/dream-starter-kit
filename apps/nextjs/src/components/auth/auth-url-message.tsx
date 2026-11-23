"use client";

import { useEffect, useRef } from "react";

import { toast } from "@acme/ui/toast";

import { parseAuthUrlMessage } from "~/lib/auth/url-message";

/**
 * Shows auth status from the URL (GoTrue's `?message=` / `#error=`, the kit's
 * `?notice=`; allowlisted copy only — see lib/auth/url-message.ts) as a top-center toast on whatever page GoTrue
 * landed on, then removes those params from the address bar. Mounted once in
 * the front-end root layout.
 */
export function AuthUrlMessage() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const { pathname, search, hash } = window.location;
    const result = parseAuthUrlMessage(search, hash);
    if (!result) return;

    if (result.toast) {
      const show = result.toast.kind === "error" ? toast.error : toast.success;
      show(result.toast.text, {
        id: "auth-url-message",
        position: "top-center",
        duration: 10_000,
      });
    }
    window.history.replaceState(
      window.history.state,
      "",
      `${pathname}${result.search}${result.hash}`,
    );
  }, []);

  return null;
}

"use client";

import { useState } from "react";

import { SupabaseProvider } from "@acme/api";

import { CaptchaProvider } from "~/components/captcha/captcha-provider";
import { ModClientProviders } from "~/components/mod-widgets-provider";
import { env } from "~/env";
import { createClient } from "~/lib/supabase/client";

/**
 * Client-side providers. Creates the browser Supabase client once and shares it
 * (plus react-query) with the rest of the app via `@acme/api`'s provider.
 * `CaptchaProvider` supplies the Cloudflare Turnstile token for auth calls
 * (anonymous sign-in, sign-in/up); inert when no site key is configured.
 * `ModClientProviders` exposes module adapters and slots (docs/MODULES.md).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => createClient());
  return (
    <SupabaseProvider client={client}>
      <CaptchaProvider siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}>
        {/* Module adapters + slots for every page (public ones included,
            e.g. the paywall on premium posts). Unfiltered here; the (app)
            shell re-provides them minus runtime-disabled modules. */}
        <ModClientProviders>{children}</ModClientProviders>
      </CaptchaProvider>
    </SupabaseProvider>
  );
}

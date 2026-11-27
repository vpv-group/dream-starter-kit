"use client";

import type { SupportedStorage } from "@supabase/supabase-js";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@acme/api/types";
import { SupabaseProvider } from "@acme/api";

import { env, supabaseAnonKey } from "~/env";

/** localStorage when the browser allows it in this frame, else memory. */
function frameStorage(): SupportedStorage {
  const memory = new Map<string, string>();
  const fallback: SupportedStorage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => void memory.set(k, v),
    removeItem: (k) => void memory.delete(k),
  };
  try {
    const probe = "__dream_embed_probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return fallback;
  }
}

/**
 * Supabase for pages inside an iframe on another site. Browsers block or
 * partition third-party cookies there, so the cookie session the rest of the
 * web app uses isn't available: this client keeps its own session in the
 * frame's (partitioned) localStorage and module hooks send it as a bearer
 * token. Signing in happens inside the frame (email code), separately from
 * the main site's session.
 */
export function EmbedProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(() =>
    createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, supabaseAnonKey(), {
      auth: {
        storageKey: "dream-embed-auth",
        persistSession: typeof window !== "undefined",
        autoRefreshToken: typeof window !== "undefined",
        detectSessionInUrl: false,
        ...(typeof window !== "undefined" ? { storage: frameStorage() } : {}),
      },
    }),
  );
  return <SupabaseProvider client={client}>{children}</SupabaseProvider>;
}

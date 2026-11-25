"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { SupabaseProvider } from "@acme/api";

import { createClient } from "~/lib/supabase/client";

/**
 * /admin provider for module settings components (manifest
 * `admin.settingsComponent`): the same Supabase client + react-query setup
 * the app uses, so a module's hooks work on its page in /admin. The admin
 * user is signed in to Supabase already (CMS auth is SSO from the session).
 */
export function ModAdminProviders({ children }: { children: ReactNode }) {
  const [client] = useState(() => createClient());
  return <SupabaseProvider client={client}>{children}</SupabaseProvider>;
}

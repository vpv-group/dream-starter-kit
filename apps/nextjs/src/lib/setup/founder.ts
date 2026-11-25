import "server-only";

import type { SetupContext } from "./steps";
import { getUpdates } from "~/lib/mod/updates";
import { getAuthSettings } from "~/lib/payload";
import { createClient } from "~/lib/supabase/server";

/**
 * Server context for the /cms-setup/* steps: is the visitor an admin, and
 * which steps apply. Not admin → null (the pages send them into the app).
 */
export async function founderSetupContext(): Promise<{
  steps: SetupContext;
  updates: Awaited<ReturnType<typeof getUpdates>>;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("is_staff")
    .eq("id", user.id)
    .maybeSingle();
  if (!data?.is_staff) return null;

  const [settings, updates] = await Promise.all([
    getAuthSettings(),
    getUpdates(),
  ]);
  const ok = updates.status === "ok" ? updates : null;
  return {
    steps: {
      askAccountModel: !settings.accountModelChosen,
      updatesAvailable: Boolean(ok?.brokerConfigured),
      githubConnected: Boolean(ok?.connected),
    },
    updates,
  };
}

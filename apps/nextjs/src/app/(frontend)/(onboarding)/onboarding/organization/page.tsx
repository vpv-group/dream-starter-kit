import { redirect } from "next/navigation";

import { getAuthSettings } from "~/lib/payload";
import { createClient } from "~/lib/supabase/server";
import { OrganizationOnboarding } from "./organization-onboarding";

export const dynamic = "force-dynamic";

/**
 * Create-or-join step after sign-up (docs/AUTH.md → Organizations). Reached
 * from /welcome when organization mode is "required" and the user has no
 * membership yet, and from the header switcher's "Create organization"
 * (`?new=1`).
 */
export default async function OrganizationOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const { new: createNew } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous)
    redirect("/sign-in?redirectTo=/onboarding/organization");

  const [settings, invitations, memberships] = await Promise.all([
    getAuthSettings(),
    supabase.rpc("my_invitations"),
    supabase
      .from("memberships")
      .select("org_id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  const hasMembership = (memberships.count ?? 0) > 0;
  if (hasMembership && !createNew && (invitations.data ?? []).length === 0) {
    redirect("/a");
  }

  return (
    <OrganizationOnboarding
      email={user.email ?? ""}
      invitations={(invitations.data ?? []).map((i) => ({
        id: i.id,
        orgId: i.org_id,
        orgName: i.org_name,
        role: i.role,
        invitedBy: i.invited_by_name,
        createdAt: i.created_at,
      }))}
      canSkip={settings.organizationMode !== "required" || hasMembership}
    />
  );
}

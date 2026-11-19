import "server-only";

import { cookies } from "next/headers";

import type { OrgSummary } from "@acme/app";
import { ACTIVE_ORG_KEY, pickActiveOrg } from "@acme/app";

import type { createClient } from "~/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The signed-in user's organizations (oldest membership first) and the active
 * one, read under RLS. The active choice lives in a plain cookie — it's a UI
 * preference; RLS is the security boundary.
 */
export async function getOrgContext(
  supabase: ServerClient,
  userId: string,
): Promise<{ orgs: OrgSummary[]; activeId: string | null }> {
  const { data, error } = await supabase
    .from("memberships")
    .select("role, created_at, organizations(id, name, website, is_personal)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[org] memberships lookup failed", error.message);
    return { orgs: [], activeId: null };
  }
  const orgs: OrgSummary[] = data.flatMap((m) => {
    const o = m.organizations;
    return [
      {
        id: o.id,
        name: o.name,
        website: o.website,
        isPersonal: o.is_personal,
        role: m.role as OrgSummary["role"],
      },
    ];
  });
  const stored = (await cookies()).get(ACTIVE_ORG_KEY)?.value;
  return { orgs, activeId: pickActiveOrg(orgs, stored)?.id ?? null };
}

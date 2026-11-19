"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import type { OrgSummary } from "@acme/app";
import { ACTIVE_ORG_KEY, ActiveOrgProvider } from "@acme/app";

/** Web wrapper: persists the active organization in a cookie and refreshes. */
export function WebActiveOrgProvider({
  orgs,
  activeId,
  children,
}: {
  orgs: OrgSummary[];
  activeId: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const persist = useCallback(
    (id: string) => {
      document.cookie = `${ACTIVE_ORG_KEY}=${encodeURIComponent(id)}; Path=/; Max-Age=31536000; SameSite=Lax`;
      router.refresh();
    },
    [router],
  );
  return (
    <ActiveOrgProvider orgs={orgs} initialActiveId={activeId} persist={persist}>
      {children}
    </ActiveOrgProvider>
  );
}

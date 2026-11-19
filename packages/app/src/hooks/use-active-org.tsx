"use client";

import { createContext, useContext, useMemo, useState } from "react";

import type { OrgSummary } from "../organizations";
import { pickActiveOrg } from "../organizations";

interface ActiveOrgValue {
  orgs: OrgSummary[];
  activeOrg: OrgSummary | null;
  setActiveOrg: (id: string) => void;
}

const ActiveOrgContext = createContext<ActiveOrgValue | null>(null);

/**
 * Provides the user's organizations and the active one. Platform code
 * supplies the list and a `persist` callback (a cookie + refresh on web,
 * AsyncStorage on native). Safe on both platforms.
 */
export function ActiveOrgProvider({
  orgs,
  initialActiveId,
  persist,
  children,
}: {
  orgs: OrgSummary[];
  initialActiveId?: string | null;
  persist?: (id: string) => void;
  children: React.ReactNode;
}) {
  const [activeId, setActiveId] = useState<string | null>(
    () => pickActiveOrg(orgs, initialActiveId)?.id ?? null,
  );
  const value = useMemo<ActiveOrgValue>(
    () => ({
      orgs,
      activeOrg: pickActiveOrg(orgs, activeId),
      setActiveOrg: (id: string) => {
        setActiveId(id);
        persist?.(id);
      },
    }),
    [orgs, activeId, persist],
  );
  return (
    <ActiveOrgContext.Provider value={value}>
      {children}
    </ActiveOrgContext.Provider>
  );
}

/** The user's organizations and the active one. Empty outside a provider. */
export function useActiveOrg(): ActiveOrgValue {
  return (
    useContext(ActiveOrgContext) ?? {
      orgs: [],
      activeOrg: null,
      setActiveOrg: () => undefined,
    }
  );
}

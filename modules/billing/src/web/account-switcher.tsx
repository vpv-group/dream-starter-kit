"use client";

import { useEffect, useState } from "react";
import {
  IconBuilding,
  IconCheck,
  IconChevronDown,
  IconLifebuoy,
  IconUser,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";

import type { MyWorkspace } from "@acme/app";
import { Button } from "@acme/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@acme/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@acme/ui/dropdown-menu";

/**
 * Whose billing /billing shows: "me", a workspace (`org:<id>`), or — staff
 * only — any person (`user:<id>`). Kept in the URL (`?account=`), so a
 * support view is linkable and never changes the viewer's own active
 * workspace.
 */
export type BillingAccount =
  { kind: "me" } | { kind: "org"; id: string } | { kind: "user"; id: string };

export function parseAccount(raw: string | null): BillingAccount {
  const m = /^(org|user):([0-9a-f-]{36})$/i.exec(raw ?? "");
  if (!m?.[1] || !m[2]) return { kind: "me" };
  return { kind: m[1] === "org" ? "org" : "user", id: m[2] };
}

export function accountParam(a: BillingAccount): string | null {
  return a.kind === "me" ? null : `${a.kind}:${a.id}`;
}

interface SearchResult {
  kind: "org" | "user";
  id: string;
  label: string;
  detail: string;
}

/** Staff: find any person or workspace (debounced). */
function useAccountSearch(q: string, enabled: boolean) {
  const [term, setTerm] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  return useQuery({
    queryKey: ["billing-admin-search", term],
    enabled: enabled && term.length >= 2,
    queryFn: async (): Promise<SearchResult[]> => {
      const res = await fetch(
        `/api/mod/billing/admin/search?q=${encodeURIComponent(term)}`,
      );
      if (!res.ok) return [];
      return ((await res.json()) as { results?: SearchResult[] }).results ?? [];
    },
  });
}

/**
 * "Billing account for …" switcher: Personal, the workspaces you administer
 * (their plans are yours to manage), and — for staff — "Find an account…",
 * which opens any person or workspace in the read-only support view.
 */
export function AccountSwitcher({
  current,
  label,
  email,
  workspaces,
  isStaff,
  onSelect,
}: {
  current: BillingAccount;
  label: string;
  email: string | null;
  workspaces: MyWorkspace[];
  isStaff: boolean;
  onSelect: (a: BillingAccount) => void;
}) {
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const results = useAccountSearch(q, isStaff && searching);
  const manageable = workspaces.filter((w) => w.role !== "member");
  const is = (a: BillingAccount) =>
    a.kind === current.kind &&
    (a.kind === "me" || (current.kind !== "me" && a.id === current.id));

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="max-w-full gap-2"
            aria-label="Switch billing account"
          >
            <span className="truncate">{label}</span>
            <IconChevronDown className="size-4 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>Billing account</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => onSelect({ kind: "me" })}>
            <IconUser className="size-4" />
            <span className="flex min-w-0 flex-col">
              <span>Personal</span>
              {email && (
                <span className="text-muted-foreground truncate text-xs">
                  {email}
                </span>
              )}
            </span>
            {is({ kind: "me" }) && <IconCheck className="ml-auto size-4" />}
          </DropdownMenuItem>
          {manageable.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
              {manageable.map((w) => (
                <DropdownMenuItem
                  key={w.id}
                  onSelect={() => onSelect({ kind: "org", id: w.id })}
                >
                  <IconBuilding className="size-4" />
                  <span className="truncate">{w.name}</span>
                  {is({ kind: "org", id: w.id }) && (
                    <IconCheck className="ml-auto size-4" />
                  )}
                </DropdownMenuItem>
              ))}
            </>
          )}
          {isStaff && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setSearching(true)}>
                <IconLifebuoy className="size-4" />
                Find an account… (staff)
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {isStaff && (
        <CommandDialog
          open={searching}
          onOpenChange={setSearching}
          title="Find an account"
          description="Search people by email or name, and workspaces by name."
        >
          <CommandInput
            placeholder="Email, name or workspace…"
            value={q}
            onValueChange={setQ}
          />
          <CommandList>
            <CommandEmpty>
              {q.trim().length < 2
                ? "Type at least 2 characters."
                : results.isFetching
                  ? "Searching…"
                  : "No accounts found."}
            </CommandEmpty>
            {(results.data ?? []).length > 0 && (
              <CommandGroup heading="Accounts and workspaces">
                {(results.data ?? []).map((r) => (
                  <CommandItem
                    key={`${r.kind}:${r.id}`}
                    // cmdk filters on value: include what the server matched.
                    value={`${r.label} ${r.detail} ${r.kind}:${r.id}`}
                    onSelect={() => {
                      setSearching(false);
                      setQ("");
                      onSelect({ kind: r.kind, id: r.id });
                    }}
                  >
                    {r.kind === "org" ? (
                      <IconBuilding className="size-4" />
                    ) : (
                      <IconUser className="size-4" />
                    )}
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{r.label}</span>
                      <span className="text-muted-foreground truncate text-xs">
                        {r.detail}
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </CommandDialog>
      )}
    </>
  );
}

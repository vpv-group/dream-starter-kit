"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Layers } from "lucide-react";

import type { StaffWorkspace, WorkspaceView } from "@acme/app";
import {
  labelLower,
  labelPlural,
  useSetWorkspaceView,
  useStaffWorkspaces,
  useWorkspaceView,
  WorkspaceViewProvider,
} from "@acme/app";
import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@acme/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@acme/ui/popover";
import { toast } from "@acme/ui/toast";

/** Token-tinted marks (chart series), picked by a stable hash of the id. */
const TINTS = [
  "bg-chart-1/25",
  "bg-chart-2/25",
  "bg-chart-3/25",
  "bg-chart-4/25",
  "bg-chart-5/25",
] as const;

function tintFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return TINTS[Math.abs(h) % TINTS.length] ?? TINTS[0];
}

function Mark({
  id,
  name,
  logoUrl,
  className,
}: {
  id: string;
  name: string;
  logoUrl: string | null;
  className?: string;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        aria-hidden
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "text-foreground flex shrink-0 items-center justify-center rounded-full text-[0.625rem] font-semibold",
        tintFor(id),
        className,
      )}
    >
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

/**
 * Wires the staff workspace view into the app shell: the server-validated
 * value from the `view_org` cookie, and a setter that stores the new scope
 * (POST /api/workspaces/view) and re-renders server components.
 */
export function WorkspaceViewClientProvider({
  value,
  children,
}: {
  value: WorkspaceView;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setView = React.useCallback(
    async (orgId: string | null) => {
      const res = await fetch("/api/workspaces/view", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "Couldn't switch.");
      }
      await queryClient.invalidateQueries();
      router.refresh();
    },
    [router, queryClient],
  );
  return (
    <WorkspaceViewProvider value={value} setView={setView}>
      {children}
    </WorkspaceViewProvider>
  );
}

/**
 * Header workspace switcher for staff (docs/WORKSPACES.md → Staff workspace
 * view). Lists every workspace (`staff_workspaces`), searchable, with an
 * "All …" entry that clears the scope. Modules read the choice with
 * `useWorkspaceView()` to scope their staff screens. Labels follow the
 * founder's workspace label (Workspace / Organization / Team …).
 */
export function WorkspaceViewSwitcher({
  label,
  logoUrl,
}: {
  /** The founder's workspace label (authentication-settings). */
  label: string;
  /** Logo of the scoped workspace (server-provided). */
  logoUrl: string | null;
}) {
  const view = useWorkspaceView();
  const setView = useSetWorkspaceView();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [pending, setPending] = React.useState<string | null | undefined>();
  const { data, isLoading, isError } = useStaffWorkspaces(q.trim(), {
    enabled: open,
  });
  const plural = labelPlural(label);
  const rows: StaffWorkspace[] = data ?? [];
  const searchable = rows.length > 8 || q !== "";

  const choose = async (orgId: string | null) => {
    setPending(orgId);
    try {
      await setView(orgId);
      setOpen(false);
      setQ("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't switch.");
    } finally {
      setPending(undefined);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${label}: ${view.name ?? `All ${labelLower(plural)}`}`}
          data-slot="workspace-view-switcher"
        >
          {view.orgId && view.name ? (
            <Mark
              id={view.orgId}
              name={view.name}
              logoUrl={logoUrl}
              className="size-4"
            />
          ) : (
            <Layers className="text-muted-foreground" />
          )}
          <span className="hidden max-w-48 truncate font-medium md:inline">
            {view.name ?? `All ${labelLower(plural)}`}
          </span>
          <ChevronsUpDown className="text-muted-foreground size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command shouldFilter={false}>
          <div className="text-muted-foreground px-3 pt-2.5 pb-1 text-xs font-medium">
            {plural}
          </div>
          {searchable ? (
            <CommandInput
              placeholder={`Search ${labelLower(plural)}…`}
              value={q}
              onValueChange={setQ}
            />
          ) : null}
          <CommandList>
            <CommandGroup>
              <CommandItem
                value="__all__"
                onSelect={() => void choose(null)}
                disabled={pending !== undefined}
                className="gap-3 py-2"
              >
                <span className="bg-muted flex size-6 shrink-0 items-center justify-center rounded-full">
                  <Layers className="size-3.5" />
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    All {labelLower(plural)}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    No {labelLower(label)} filter
                  </span>
                </div>
                {view.orgId === null ? <Check className="ml-auto" /> : null}
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            {isLoading ? (
              <div className="text-muted-foreground px-3 py-4 text-sm">
                Loading…
              </div>
            ) : isError ? (
              <div className="text-destructive px-3 py-4 text-sm">
                Couldn't load {labelLower(plural)}.
              </div>
            ) : (
              <>
                <CommandEmpty>No {labelLower(plural)} found.</CommandEmpty>
                <CommandGroup>
                  {rows.map((w) => (
                    <CommandItem
                      key={w.id}
                      value={w.id}
                      onSelect={() => void choose(w.id)}
                      disabled={pending !== undefined}
                      className="gap-3 py-2"
                    >
                      <Mark
                        id={w.id}
                        name={w.name}
                        logoUrl={w.logoUrl}
                        className="size-6"
                      />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">
                          {w.name}
                        </span>
                        <span className="text-muted-foreground truncate text-xs tabular-nums">
                          {w.slug} · {w.memberCount}{" "}
                          {w.memberCount === 1 ? "member" : "members"}
                        </span>
                      </div>
                      {view.orgId === w.id ? (
                        <Check className="ml-auto" />
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

import { cn } from "@acme/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@acme/ui/dropdown-menu";

import type { Sort } from "../../shared/config";

const SORT_LABELS: Record<Sort, string> = {
  trending: "Trending",
  top: "Top",
  new: "New",
};

/**
 * Canny's "Showing [Trending ▾]" menu: one dropdown with two columns —
 * SORT (radio, a dot on the current one) and FILTER (statuses, multi).
 * State lives in the URL (?sort=, ?status=) so the server renders the list.
 */
export function SortFilterMenu({
  statuses,
}: {
  statuses: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const sort = (params.get("sort") as Sort | null) ?? "trending";
  const selected = new Set(params.getAll("status"));

  const update = (fn: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    fn(next);
    next.delete("page");
    router.push(`?${next.toString()}`, { scroll: false });
  };

  const label =
    selected.size > 0
      ? `${SORT_LABELS[sort]} · ${selected.size} status${selected.size > 1 ? "es" : ""}`
      : SORT_LABELS[sort];

  return (
    <div className="text-muted-foreground flex items-center gap-1 text-sm">
      <span>Showing</span>
      <DropdownMenu>
        <DropdownMenuTrigger className="text-foreground hover:bg-muted flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium outline-none focus-visible:ring-[3px]">
          {label}
          <ChevronDownIcon className="size-3.5" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="flex w-auto p-0">
          <div className="w-32 border-r p-1">
            <DropdownMenuLabel className="text-muted-foreground text-xs uppercase">
              Sort
            </DropdownMenuLabel>
            {(Object.keys(SORT_LABELS) as Sort[]).map((key) => (
              <DropdownMenuItem
                key={key}
                onSelect={() =>
                  update((p) =>
                    key === "trending" ? p.delete("sort") : p.set("sort", key),
                  )
                }
                className="gap-2"
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full",
                    sort === key ? "bg-primary" : "bg-transparent",
                  )}
                />
                {SORT_LABELS[key]}
              </DropdownMenuItem>
            ))}
          </div>
          <div className="w-44 p-1">
            <DropdownMenuLabel className="text-muted-foreground text-xs uppercase">
              Filter
            </DropdownMenuLabel>
            {statuses.map((s) => (
              <DropdownMenuItem
                key={s.id}
                onSelect={(e) => {
                  e.preventDefault();
                  update((p) => {
                    const all = new Set(p.getAll("status"));
                    if (all.has(s.id)) all.delete(s.id);
                    else all.add(s.id);
                    p.delete("status");
                    for (const v of all) p.append("status", v);
                  });
                }}
                className="justify-between gap-2"
              >
                {s.name}
                {selected.has(s.id) ? (
                  <CheckIcon className="size-4" aria-hidden />
                ) : null}
              </DropdownMenuItem>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontalIcon } from "lucide-react";

import { Button } from "@acme/ui/button";
import { Checkbox } from "@acme/ui/checkbox";
import { Label } from "@acme/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@acme/ui/popover";
import { Switch } from "@acme/ui/switch";

/**
 * Canny's roadmap Filters popover: "Filters" + Select none, a checkbox per
 * board, and "Show uncategorized posts". State in the URL
 * (?hide=<board ids>, ?uncategorized=0) so the server renders the columns.
 */
export function RoadmapFilters({
  boards,
}: {
  boards: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const hidden = new Set((params.get("hide") ?? "").split(",").filter(Boolean));
  const showUncategorized = params.get("uncategorized") !== "0";

  const push = (nextHidden: Set<string>, uncategorized: boolean) => {
    const next = new URLSearchParams(params.toString());
    if (nextHidden.size) next.set("hide", [...nextHidden].join(","));
    else next.delete("hide");
    if (uncategorized) next.delete("uncategorized");
    else next.set("uncategorized", "0");
    router.push(`?${next.toString()}`, { scroll: false });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontalIcon />
          Filters
          {hidden.size ? (
            <span className="text-muted-foreground tabular-nums">
              ({boards.length - hidden.size}/{boards.length})
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-sm font-semibold">Filters</h2>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() =>
              push(new Set(boards.map((b) => b.id)), showUncategorized)
            }
          >
            Select none
          </Button>
        </div>
        <div className="flex flex-col gap-2.5">
          {boards.map((b) => (
            <div key={b.id} className="flex items-center gap-2">
              <Checkbox
                id={`rm-board-${b.id}`}
                checked={!hidden.has(b.id)}
                onCheckedChange={(v) => {
                  const next = new Set(hidden);
                  if (v === true) next.delete(b.id);
                  else next.add(b.id);
                  push(next, showUncategorized);
                }}
              />
              <Label
                htmlFor={`rm-board-${b.id}`}
                className="text-sm font-normal"
              >
                {b.name}
              </Label>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between border-t pt-3">
          <Label htmlFor="rm-uncat" className="text-sm font-normal">
            Show uncategorized posts
          </Label>
          <Switch
            id="rm-uncat"
            checked={showUncategorized}
            onCheckedChange={(v) => push(hidden, v)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

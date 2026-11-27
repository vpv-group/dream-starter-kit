"use client";

import { useState } from "react";
import {
  ExternalLinkIcon,
  LinkIcon,
  PlusIcon,
  RefreshCwIcon,
  UnlinkIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@acme/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@acme/ui/popover";
import { Skeleton } from "@acme/ui/skeleton";

import type { IssueLink, TrackerRow } from "../hooks/use-feedback";
import {
  useTrackerAction,
  useTrackers,
  useTrackerSearch,
  useTrackerStatus,
} from "../hooks/use-feedback";

const STATE_LABEL: Record<
  string,
  {
    label: string;
    variant: "neutral" | "info" | "warning" | "success" | "danger";
  }
> = {
  backlog: { label: "Backlog", variant: "neutral" },
  unstarted: { label: "Open", variant: "info" },
  started: { label: "In progress", variant: "warning" },
  completed: { label: "Closed", variant: "success" },
  canceled: { label: "Not planned", variant: "danger" },
};

/**
 * The idea's issue panel: one row per registered tracker (GitHub built in,
 * adapters add more). Link an existing issue or create one from the idea;
 * the state badge shows the last sync. "Connect GitHub" when the Meet Dream
 * AI App isn't connected — everything else keeps working without it.
 */
export function IssuePanel({
  ideaId,
  links,
}: {
  ideaId: string;
  links: IssueLink[];
}) {
  const trackers = useTrackers();
  if (trackers.isLoading) return <Skeleton className="h-16 w-full" />;
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Issue tracker</h3>
      {(trackers.data ?? []).map((t) => (
        <TrackerRowView
          key={t.provider}
          tracker={t}
          ideaId={ideaId}
          link={links.find((l) => l.provider === t.provider)}
        />
      ))}
    </div>
  );
}

function TrackerRowView({
  tracker,
  ideaId,
  link,
}: {
  tracker: TrackerRow;
  ideaId: string;
  link: IssueLink | undefined;
}) {
  const status = useTrackerStatus(tracker);
  const action = useTrackerAction();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const results = useTrackerSearch(open ? tracker : undefined, q);
  const run = (
    a: "link" | "create" | "unlink" | "sync",
    body: Record<string, unknown>,
    done: string,
  ) =>
    action.mutate(
      { tracker, action: a, body },
      {
        onSuccess: () => {
          toast.success(done);
          setOpen(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );

  if (status.isLoading) return <Skeleton className="h-10 w-full" />;
  if (!status.data?.connected) {
    return (
      <div className="text-muted-foreground flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
        <span>
          <span className="text-foreground font-medium">{tracker.label}</span>{" "}
          isn&apos;t connected.
        </span>
        {tracker.provider === "github" ? (
          <Button asChild size="sm" variant="outline">
            <a href="/admin/updates">Connect GitHub</a>
          </Button>
        ) : null}
      </div>
    );
  }

  if (link) {
    const state = STATE_LABEL[link.state_category] ?? STATE_LABEL.unstarted;
    return (
      <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
        <div className="flex items-start gap-2">
          <span className="text-muted-foreground font-mono text-xs">
            {link.key}
          </span>
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 font-medium hover:underline"
          >
            {link.title}
            <ExternalLinkIcon className="ml-1 inline size-3" aria-hidden />
          </a>
          {state ? <Badge variant={state.variant}>{state.label}</Badge> : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground mr-auto text-xs">
            {tracker.label} · {status.data.target ?? ""} · status syncs both
            ways
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={action.isPending}
            onClick={() => run("sync", {}, "Synced")}
          >
            <RefreshCwIcon />
            Sync now
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={action.isPending}
            onClick={() => run("unlink", { ideaId }, "Unlinked")}
          >
            <UnlinkIcon />
            Unlink
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border p-3 text-sm">
      <span className="mr-auto">
        <span className="font-medium">{tracker.label}</span>
        <span className="text-muted-foreground">
          {" "}
          · {status.data.target ?? ""}
        </span>
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline">
            <LinkIcon />
            Link issue
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <Command shouldFilter={false}>
            <CommandInput
              value={q}
              onValueChange={setQ}
              placeholder="Search issues or #number…"
            />
            <CommandList>
              <CommandEmpty>
                {results.isFetching
                  ? "Searching…"
                  : results.error
                    ? results.error.message
                    : "No issues found."}
              </CommandEmpty>
              <CommandGroup>
                {(results.data ?? []).map((issue) => (
                  <CommandItem
                    key={issue.externalId}
                    value={issue.externalId}
                    onSelect={() =>
                      run(
                        "link",
                        { ideaId, externalId: issue.externalId },
                        `Linked ${issue.key}`,
                      )
                    }
                  >
                    <span className="text-muted-foreground font-mono text-xs">
                      {issue.key}
                    </span>
                    <span className="truncate">{issue.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Button
        size="sm"
        disabled={action.isPending}
        onClick={() =>
          run("create", { ideaId }, `Created a ${tracker.label} issue`)
        }
      >
        <PlusIcon />
        Create issue
      </Button>
    </div>
  );
}

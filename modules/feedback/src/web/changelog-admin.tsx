"use client";

import Link from "next/link";
import { ExternalLinkIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Checkbox } from "@acme/ui/checkbox";
import { Skeleton } from "@acme/ui/skeleton";
import { toneBadgeVariant } from "@acme/ui/status-dot";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@acme/ui/table";

import { useLinkChangelog, useStaffChangelog } from "../hooks/use-feedback";
import { CHANGELOG_TYPE_META } from "../shared/changelog";

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const ADMIN = "/admin/collections/mod-feedback-changelog";

function TypeBadge({ type }: { type: string }) {
  const meta = CHANGELOG_TYPE_META[type as keyof typeof CHANGELOG_TYPE_META] as
    (typeof CHANGELOG_TYPE_META)[keyof typeof CHANGELOG_TYPE_META] | undefined;
  return meta ? (
    <Badge variant={toneBadgeVariant(meta.tone)}>{meta.label}</Badge>
  ) : null;
}

/** Staff Changelog tab: entries (drafts + published); writing happens in /admin. */
export function ChangelogTab() {
  const entries = useStaffChangelog();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Entries are written in /admin. Publishing one ships its linked ideas
          and tells their voters once.
        </p>
        <Button asChild size="sm">
          <Link href={`${ADMIN}/create`}>
            <PlusIcon />
            New entry
          </Link>
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Entry</TableHead>
              <TableHead className="w-28">Type</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-24 text-right">Ideas</TableHead>
              <TableHead className="w-32">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.isLoading ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : (entries.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground h-24 text-center"
                >
                  No entries yet.
                </TableCell>
              </TableRow>
            ) : (
              entries.data?.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="max-w-0">
                    <Link
                      href={`${ADMIN}/${e.id}`}
                      className="block truncate font-medium hover:underline"
                    >
                      {e.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <TypeBadge type={e.type} />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        e._status === "published" ? "success" : "neutral"
                      }
                    >
                      {e._status === "published" ? "Published" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {e.linkedIdeas?.length ?? 0}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {e.publishedAt
                      ? dateFmt.format(new Date(e.publishedAt))
                      : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/** In the idea sheet: which changelog entries announce this idea. */
export function IdeaChangelogLinks({ ideaId }: { ideaId: string }) {
  const entries = useStaffChangelog();
  const link = useLinkChangelog();
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">Changelog</h3>
      <p className="text-muted-foreground text-xs">
        Link the entry that announces this idea: publishing it moves the idea to
        the shipped stage and tells its voters.
      </p>
      {(entries.data ?? []).length === 0 ? (
        <p className="text-muted-foreground text-sm">No entries yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {entries.data?.slice(0, 12).map((e) => {
            const linked = (e.linkedIdeas ?? []).includes(ideaId);
            return (
              <li key={e.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  id={`cl-link-${e.id}`}
                  checked={linked}
                  disabled={link.isPending}
                  onCheckedChange={(v) =>
                    link.mutate(
                      { entryId: e.id, ideaId, linked: v === true },
                      { onError: (err) => toast.error(err.message) },
                    )
                  }
                />
                <label
                  htmlFor={`cl-link-${e.id}`}
                  className="min-w-0 flex-1 truncate"
                >
                  {e.title}
                </label>
                <span className="text-muted-foreground text-xs">
                  {e._status === "published" ? "Published" : "Draft"}
                </span>
                <Link
                  href={`${ADMIN}/${e.id}`}
                  aria-label={`Open ${e.title} in /admin`}
                >
                  <ExternalLinkIcon className="text-muted-foreground size-3.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

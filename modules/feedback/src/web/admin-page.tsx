"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CheckIcon,
  ExternalLinkIcon,
  InboxIcon,
  RefreshCwIcon,
  SettingsIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@acme/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@acme/ui/empty";
import { Input } from "@acme/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@acme/ui/select";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@acme/ui/tabs";

import type { StaffPost } from "../hooks/use-feedback";
import type { Sort } from "../shared/config";
import {
  useBoards,
  useIsFeedbackStaff,
  useResyncConfig,
  useSetStatus,
  useStaffIdeas,
  useStaffInbox,
  useStaffPosts,
  useStatuses,
  useUpdatePost,
} from "../hooks/use-feedback";
import { toneOf } from "../shared/tones";
import { AutopilotInbox } from "./autopilot";
import { ChangelogTab } from "./changelog-admin";
import { IdeaSheet, IdeasTab, RoadmapBoard } from "./ideas";

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

/**
 * The staff workspace (/a/feedback): triage and manage feedback while signed
 * in as staff. Inbox (posts awaiting approval, stale posts, newest) and the
 * Posts table; configuration stays in /admin → Feedback.
 */
export function FeedbackAdminPage() {
  const staff = useIsFeedbackStaff();
  const resync = useResyncConfig();
  const ideas = useStaffIdeas();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const openIdea = params.get("idea");
  const tab = params.get("tab") ?? (openIdea ? "ideas" : "inbox");
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  if (staff.isLoading) {
    return (
      <div className="@container/main flex flex-col gap-4 p-4 lg:p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!staff.data) {
    return (
      <div className="p-4 lg:p-6">
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Staff only</EmptyTitle>
            <EmptyDescription>
              This is where the team manages feedback.{" "}
              <Link href="/feedback" className="underline">
                Visit the feedback portal
              </Link>
              .
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="@container/main flex flex-col gap-6 p-4 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">
          Feedback
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={resync.isPending}
            onClick={() =>
              resync.mutate(undefined, {
                onSuccess: (r) =>
                  toast.success(
                    `Synced ${r.boards} boards, ${r.statuses} statuses, ${r.tags} tags`,
                  ),
                onError: (e) => toast.error(e.message),
              })
            }
          >
            <RefreshCwIcon />
            Resync settings
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/module-settings/feedback">
              <SettingsIcon />
              Settings
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/feedback" target="_blank">
              <ExternalLinkIcon />
              Open portal
            </Link>
          </Button>
        </div>
      </header>
      <Tabs value={tab} onValueChange={(v) => setParam("tab", v)}>
        <TabsList variant="line">
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="ideas">Ideas</TabsTrigger>
          <TabsTrigger value="roadmap">Roadmap</TabsTrigger>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="changelog">Changelog</TabsTrigger>
        </TabsList>
        <TabsContent value="changelog" className="pt-4">
          <ChangelogTab />
        </TabsContent>
        <TabsContent value="ideas" className="pt-4">
          <IdeasTab
            data={ideas.data}
            loading={ideas.isLoading}
            onOpen={(id) => setParam("idea", id)}
          />
        </TabsContent>
        <TabsContent value="roadmap" className="pt-4">
          <RoadmapBoard
            data={ideas.data}
            onOpen={(id) => setParam("idea", id)}
          />
        </TabsContent>
        <TabsContent value="inbox" className="pt-4">
          <InboxTab />
        </TabsContent>
        <TabsContent value="posts" className="pt-4">
          <PostsTab />
        </TabsContent>
      </Tabs>
      <IdeaSheet
        id={openIdea}
        data={ideas.data}
        onClose={() => setParam("idea", null)}
      />
    </div>
  );
}

function usePostLinks() {
  const boards = useBoards();
  return useMemo(() => {
    const byId = new Map((boards.data ?? []).map((b) => [b.id, b]));
    return {
      boards: boards.data ?? [],
      board: (id: string) => byId.get(id),
      href: (p: StaffPost) => {
        const b = byId.get(p.board_id);
        return b ? `/feedback/${b.slug}/p/${p.slug}` : "#";
      },
    };
  }, [boards.data]);
}

function InboxTab() {
  const inbox = useStaffInbox();
  const update = useUpdatePost();
  const links = usePostLinks();

  if (inbox.isLoading) return <Skeleton className="h-48 w-full" />;
  if (inbox.error) {
    return <p className="text-destructive text-sm">{inbox.error.message}</p>;
  }
  const data = inbox.data;
  if (!data) return null;
  const empty =
    !data.pending.length && !data.stale.length && !data.recent.length;
  if (empty) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <InboxIcon />
          </EmptyMedia>
          <EmptyTitle>Inbox zero</EmptyTitle>
          <EmptyDescription>New feedback shows up here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid gap-4 @4xl/main:grid-cols-2">
      <AutopilotInbox />
      <Card variant="framed" className="@4xl/main:col-span-2">
        <CardHeader>
          <CardTitle>Waiting for approval ({data.pending.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 py-3">
          {data.pending.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing to approve.</p>
          ) : (
            data.pending.map((p) => (
              <div
                key={p.id}
                className="flex items-start gap-3 rounded-md border p-3"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={links.href(p)}
                    className="font-medium hover:underline"
                  >
                    {p.title}
                  </Link>
                  <p className="text-muted-foreground line-clamp-2 text-sm">
                    {p.details}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {links.board(p.board_id)?.name} ·{" "}
                    {dateFmt.format(new Date(p.created_at))}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    update.mutate(
                      { postId: p.id, approvalState: "approved" },
                      { onSuccess: () => toast.success("Approved") },
                    )
                  }
                >
                  <CheckIcon />
                  Approve
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Reject"
                  onClick={() =>
                    update.mutate(
                      { postId: p.id, approvalState: "rejected" },
                      { onSuccess: () => toast.success("Rejected") },
                    )
                  }
                >
                  <XIcon />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      <PostListCard
        title={`Stale (in progress over ${data.staleAfterWeeks} weeks)`}
        posts={data.stale}
        links={links}
        empty="Nothing stale."
      />
      <PostListCard
        title="Newest"
        posts={data.recent}
        links={links}
        empty="No posts yet."
      />
    </div>
  );
}

function PostListCard({
  title,
  posts,
  links,
  empty,
}: {
  title: string;
  posts: StaffPost[];
  links: ReturnType<typeof usePostLinks>;
  empty: string;
}) {
  return (
    <Card variant="framed">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 py-3">
        {posts.length === 0 ? (
          <p className="text-muted-foreground text-sm">{empty}</p>
        ) : (
          posts.map((p) => (
            <Link
              key={p.id}
              href={links.href(p)}
              className="hover:bg-muted flex items-center gap-3 rounded-md px-2 py-1.5 text-sm"
            >
              <span className="w-8 text-right font-semibold tabular-nums">
                {p.vote_count}
              </span>
              <span className="min-w-0 flex-1 truncate">{p.title}</span>
              <span className="text-muted-foreground text-xs">
                {links.board(p.board_id)?.name}
              </span>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function PostsTab() {
  const [board, setBoard] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<Sort>("trending");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const posts = useStaffPosts({
    board: board === "all" ? undefined : board,
    status: status === "all" ? [] : [status],
    sort,
    q: q.trim() || undefined,
    page,
  });
  const statuses = useStatuses();
  const links = usePostLinks();
  const setPostStatus = useSetStatus();
  const statusById = new Map((statuses.data ?? []).map((s) => [s.id, s]));
  const pageCount = posts.data
    ? Math.ceil(posts.data.total / posts.data.pageSize)
    : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          placeholder="Search posts…"
          className="h-8 w-full sm:w-64"
        />
        <Select
          value={board}
          onValueChange={(v) => {
            setBoard(v);
            setPage(0);
          }}
        >
          <SelectTrigger size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All boards</SelectItem>
            {links.boards.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(0);
          }}
        >
          <SelectTrigger size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(statuses.data ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger size="sm" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="trending">Trending</SelectItem>
            <SelectItem value="top">Top</SelectItem>
            <SelectItem value="new">Newest</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-right">Votes</TableHead>
              <TableHead>Post</TableHead>
              <TableHead className="w-44">Status</TableHead>
              <TableHead className="w-20 text-right">Comments</TableHead>
              <TableHead className="w-24">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.isLoading ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : (posts.data?.posts.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground h-24 text-center"
                >
                  No posts match.
                </TableCell>
              </TableRow>
            ) : (
              posts.data?.posts.map((p) => {
                const st = p.status_id
                  ? statusById.get(p.status_id)
                  : undefined;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {p.vote_count}
                    </TableCell>
                    <TableCell className="max-w-0">
                      <Link
                        href={links.href(p)}
                        className="block truncate font-medium hover:underline"
                      >
                        {p.title}
                      </Link>
                      <span className="text-muted-foreground text-xs">
                        {links.board(p.board_id)?.name}
                        {p.approval_state !== "approved"
                          ? ` · ${p.approval_state}`
                          : ""}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={p.status_id ?? ""}
                        onValueChange={(v) =>
                          setPostStatus.mutate(
                            { postId: p.id, statusId: v, notify: true },
                            {
                              onSuccess: () =>
                                toast.success(
                                  "Status updated — voters notified",
                                ),
                              onError: (e) => toast.error(e.message),
                            },
                          )
                        }
                      >
                        <SelectTrigger
                          size="sm"
                          className="w-full"
                          aria-label="Status"
                        >
                          {st ? (
                            <Badge variant={toneBadgeVariant(toneOf(st.tone))}>
                              {st.name}
                            </Badge>
                          ) : (
                            <SelectValue placeholder="—" />
                          )}
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {(statuses.data ?? []).map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.comment_count}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {dateFmt.format(new Date(p.created_at))}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      {pageCount > 1 ? (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground tabular-nums">
            Page {page + 1} of {pageCount}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}

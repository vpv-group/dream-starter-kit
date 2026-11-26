import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";

import { Card, CardContent } from "@acme/ui/card";

import type { FeedEntry, FeedPerson } from "../web/components/activity-feed";
import {
  getBoardBySlug,
  getMyVotes,
  getPeople,
  getPost,
  getPostFeed,
  getVoters,
  listCategories,
} from "../data";
import { ActivityFeed, PersonLockup } from "../web/components/activity-feed";
import { StaffPostMenu, StaffSidebar } from "../web/components/staff-panel";
import { StatusLabel } from "../web/components/status-badge";
import { VoteButton } from "../web/components/vote-button";
import { VotersList } from "../web/components/voters-card";
import { anonFor, loadPortal } from "./portal-data";
import { PortalShell } from "./portal-shell";
import { createServerSupabase } from "./supabase";

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: "long",
  day: "numeric",
  year: "numeric",
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ board: string; post: string }>;
}): Promise<Metadata> {
  const { board: boardSlug, post: slug } = await params;
  const db = await createServerSupabase();
  const board = await getBoardBySlug(db, boardSlug).catch(() => null);
  const post = board
    ? await getPost(db, board.id, slug).catch(() => null)
    : null;
  return {
    title: post ? `${post.title} · ${board?.name ?? "Feedback"}` : "Feedback",
    description: post?.details ? post.details.slice(0, 160) : undefined,
    robots: board?.search_indexing
      ? undefined
      : { index: false, follow: false },
  };
}

/**
 * A post (Canny): sidebar card with BOARD + VOTERS ("and N more…"); main
 * column with the vote box, title, colored uppercase status, author,
 * details, then the comment composer and the activity feed. Staff get the
 * inline controls (status dialog, owner, category, tags, ETA, ⋯ menu).
 * Phones stack the sidebar above the post (voters fold into a toggle).
 */
export async function FeedbackPostPage({
  params,
}: {
  params: Promise<{ board: string; post: string }>;
}) {
  const { board: boardSlug, post: slug } = await params;
  const portal = await loadPortal();
  const board = portal.boards.find((b) => b.slug === boardSlug);
  if (!board) notFound();
  const db = await createServerSupabase();
  const post = await getPost(db, board.id, slug);
  if (!post) notFound();

  const staff = Boolean(portal.viewer?.staff);
  if (post.merged_into_id && !staff) {
    const { data: target } = await db
      .from("mod_feedback_posts")
      .select("slug, board:mod_feedback_boards!inner(slug)")
      .eq("id", post.merged_into_id)
      .maybeSingle();
    if (target) redirect(`/feedback/${target.board.slug}/p/${target.slug}`);
  }

  const [feed, voters, myVotes, author, categories, tagRows, postTags] =
    await Promise.all([
      getPostFeed(db, post.id),
      getVoters(db, post.id, 15),
      getMyVotes(db, [post.id]),
      getPeople(db, [post.author_id, post.owner_id]),
      staff ? listCategories(db, board.id) : Promise.resolve([]),
      staff
        ? db
            .from("mod_feedback_tags")
            .select("id, name, tone")
            .eq("archived", false)
            .order("position")
        : Promise.resolve({
            data: [] as { id: string; name: string; tone: string }[],
          }),
      staff
        ? db
            .from("mod_feedback_post_tags")
            .select("tag_id")
            .eq("post_id", post.id)
        : Promise.resolve({ data: [] as { tag_id: string }[] }),
    ]);

  const idea =
    staff && post.idea_id
      ? (
          await db
            .from("mod_feedback_ideas")
            .select("id, title")
            .eq("id", post.idea_id)
            .maybeSingle()
        ).data
      : null;
  const status = post.status_id
    ? portal.statuses.find((s) => s.id === post.status_id)
    : undefined;
  const statusById = new Map(portal.statuses.map((s) => [s.id, s]));
  const anon = anonFor(portal, board);
  const done = status?.type === "complete" || status?.type === "closed";
  const votesOpen =
    !(board.disable_votes_when_done && done) && !post.merged_into_id;
  const commentsOpen = !(board.disable_comments_when_done && done) || staff;
  const total = voters[0]?.total ?? 0;

  const people: Record<string, FeedPerson> = Object.fromEntries(feed.people);
  const entries: FeedEntry[] = feed.items.map((i) =>
    i.kind === "comment"
      ? {
          kind: "comment",
          id: i.comment.id,
          at: i.at,
          authorId: i.comment.author_id,
          body: i.comment.body,
          parentId: i.comment.parent_id,
          internal: i.comment.is_internal,
          pinned: i.comment.pinned,
          edited: Boolean(i.comment.edited_at),
        }
      : {
          kind: "status",
          id: i.change.id,
          at: i.at,
          authorId: i.change.changed_by,
          toStatus: i.change.to_status_id
            ? (statusById.get(i.change.to_status_id) ?? null)
            : null,
          message: i.change.message,
        },
  );
  const reactions = Object.fromEntries(feed.reactions);
  const authorPerson = post.author_id ? author.get(post.author_id) : undefined;
  const owner = post.owner_id ? author.get(post.owner_id) : undefined;
  const staffState = {
    id: post.id,
    title: post.title,
    boardId: board.id,
    boardSlug: board.slug,
    statusId: post.status_id,
    categoryId: post.category_id,
    ownerId: post.owner_id,
    ownerName: owner?.display_name ?? null,
    eta: post.eta,
    etaPublic: post.eta_public,
    pinned: post.pinned,
    approvalState: post.approval_state,
    tagIds: (postTags.data ?? []).map((t) => t.tag_id),
    voteCount: post.vote_count,
    ideaId: post.idea_id,
    ideaTitle: idea?.title ?? null,
  };
  const category = categories.find((c) => c.id === post.category_id);

  const sidebar = (
    <Card variant="framed">
      <CardContent className="flex flex-col gap-5 py-4">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Board
          </span>
          <Link
            href={`/feedback/${board.slug}`}
            className="text-sm hover:underline"
          >
            {board.name}
          </Link>
        </div>
        {post.eta && (post.eta_public || staff) ? (
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              ETA
            </span>
            <span className="text-sm">
              {new Intl.DateTimeFormat(undefined, {
                month: "long",
                year: "numeric",
              }).format(new Date(post.eta))}
              {!post.eta_public ? " (internal)" : ""}
            </span>
          </div>
        ) : null}
        {board.show_voters || staff ? (
          <details className="group flex flex-col gap-2 md:open:flex" open>
            <summary className="text-muted-foreground cursor-default list-none text-xs font-semibold tracking-wide uppercase marker:hidden">
              Voters
            </summary>
            <div className="mt-2">
              <VotersList postId={post.id} voters={voters} total={total} />
            </div>
          </details>
        ) : null}
        {staff ? (
          <div className="border-t pt-4">
            <StaffSidebar
              post={staffState}
              statuses={portal.statuses.map((s) => ({
                ...s,
                notify_by_default: true,
              }))}
              categories={categories}
              tags={tagRows.data ?? []}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );

  return (
    <PortalShell
      portal={portal}
      activeBoardSlug={board.slug}
      canCreate={board.allow_new_posts}
    >
      <Link
        href={`/feedback/${board.slug}`}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm md:hidden"
      >
        <ChevronLeftIcon className="size-4" aria-hidden />
        {board.name}
      </Link>
      {post.merged_into_id ? (
        <p className="bg-warning-subtle text-warning mb-4 rounded-md px-3 py-2 text-sm">
          This post was merged into another post (staff view).
        </p>
      ) : null}
      {post.approval_state !== "approved" ? (
        <p className="bg-muted text-muted-foreground mb-4 rounded-md px-3 py-2 text-sm">
          {post.approval_state === "pending"
            ? "Waiting for approval — only you and the team can see this post."
            : "This post was not approved."}
        </p>
      ) : null}
      <div className="grid gap-6 md:grid-cols-[minmax(0,14rem)_1fr] md:gap-8 lg:grid-cols-[18.75rem_1fr]">
        <aside className="order-1">{sidebar}</aside>
        <article className="order-2 flex min-w-0 flex-col gap-6">
          <header className="flex items-start gap-3">
            <VoteButton
              postId={post.id}
              votes={post.vote_count}
              voted={myVotes.has(post.id)}
              anonAllowed={anon.votes}
              showCount={board.show_vote_counts}
              disabled={!votesOpen}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h1 className="text-xl font-bold tracking-tight break-words lg:text-2xl">
                {post.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                {status ? <StatusLabel status={status} /> : null}
                {category ? (
                  <span className="text-muted-foreground text-xs">
                    {category.name}
                  </span>
                ) : null}
              </div>
            </div>
            {staff ? <StaffPostMenu post={staffState} /> : null}
          </header>

          <div className="flex flex-col gap-3">
            <PersonLockup person={authorPerson} fallbackName="Anonymous" />
            {post.details ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {post.details}
              </p>
            ) : null}
            <CustomFieldValues values={post.custom_fields} form={board.form} />
            {board.show_dates ? (
              <time
                dateTime={post.created_at}
                className="text-muted-foreground text-xs"
              >
                {dateFmt.format(new Date(post.created_at))}
              </time>
            ) : null}
          </div>

          <ActivityFeed
            postId={post.id}
            entries={entries}
            people={people}
            reactions={reactions}
            staff={staff}
            showDates={board.show_dates}
            anonComments={anon.comments}
            anonVotes={anon.votes}
            commentsOpen={commentsOpen}
          />
        </article>
      </div>
    </PortalShell>
  );
}

function CustomFieldValues({
  values,
  form,
}: {
  values: unknown;
  form: unknown;
}) {
  const fields =
    (form as { customFields?: { key: string; label: string }[] } | null)
      ?.customFields ?? [];
  const v = (values ?? {}) as Record<string, string>;
  const rows = fields.filter((f) => v[f.key]);
  if (!rows.length) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map((f) => (
        <div key={f.key} className="contents">
          <dt className="text-muted-foreground">{f.label}</dt>
          <dd>{v[f.key]}</dd>
        </div>
      ))}
    </dl>
  );
}

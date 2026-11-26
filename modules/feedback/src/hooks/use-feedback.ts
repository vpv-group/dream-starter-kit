"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AppSupabaseClient } from "@acme/api";
import { useSupabase } from "@acme/api";
import { ensureAnonSession } from "@acme/app";

import type { Sort } from "../shared/config";
import type { ScoreFactor } from "../shared/score";
import type {
  CommentInput,
  CreatePostInput,
  IdeaUpdateInput,
  PostUpdateInput,
  StatusChangeInput,
} from "../validators";
import {
  getMyVotes,
  getPostFeed,
  getVoters,
  isStaffViewer,
  listBoards,
  listPosts,
  listRoadmapPosts,
  listStatuses,
} from "../data";

/**
 * Client hooks for the feedback module (web islands, native screens, the
 * staff workspace). Reads go through the RLS client; writes go through the
 * module's routes (/api/mod/feedback/…), which also serve anonymous
 * visitors. `apiBaseUrl` is "" on web and EXPO_PUBLIC_API_URL on native.
 */

export class FeedbackApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** True when the route wants the visitor to sign in (show the auth prompt). */
export const isAuthRequired = (err: unknown) =>
  err instanceof FeedbackApiError && err.code === "auth_required";

export async function feedbackApi<T>(
  supabase: AppSupabaseClient,
  path: string,
  init: { method?: string; body?: unknown; apiBaseUrl?: string } = {},
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(`${init.apiBaseUrl ?? ""}/api/mod/feedback${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: {
      ...(init.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: "same-origin",
  });
  const json = (await res.json().catch(() => null)) as
    (T & { error?: string; code?: string }) | null;
  if (!res.ok) {
    throw new FeedbackApiError(
      res.status,
      json?.error ?? "Request failed",
      json?.code ?? (res.status === 401 ? "auth_required" : undefined),
    );
  }
  return json as T;
}

/**
 * Make sure there's a session before an anonymous-capable write: signs the
 * visitor in anonymously (Turnstile token) only when `anonAllowed`.
 * Otherwise throws auth_required so the UI opens its sign-in prompt.
 */
export async function ensureWriter(
  supabase: AppSupabaseClient,
  anonAllowed: boolean,
  captchaToken?: string,
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) return;
  if (!anonAllowed) {
    throw new FeedbackApiError(401, "Sign in to continue.", "auth_required");
  }
  await ensureAnonSession(supabase, { captchaToken });
}

export const feedbackKeys = {
  all: ["feedback"] as const,
  config: () => ["feedback", "config"] as const,
  boards: () => ["feedback", "boards"] as const,
  statuses: () => ["feedback", "statuses"] as const,
  posts: (args: object) => ["feedback", "posts", args] as const,
  feed: (postId: string) => ["feedback", "feed", postId] as const,
  voters: (postId: string) => ["feedback", "voters", postId] as const,
  myVotes: (ids: string[]) => ["feedback", "my-votes", ids] as const,
  staff: () => ["feedback", "staff"] as const,
  inbox: () => ["feedback", "staff", "inbox"] as const,
  staffPosts: (args: object) => ["feedback", "staff", "posts", args] as const,
};

export interface PortalConfig {
  title: string;
  intro: string | null;
  tabs: { tab: "roadmap" | "feedback" | "changelog"; label: string }[];
  anon: { votes: boolean; posts: boolean; comments: boolean };
  boards: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    access: string;
    show_on_portal_home: boolean;
    allow_new_posts: boolean;
    anon_votes: "inherit" | "allow" | "deny";
    anon_posts: "inherit" | "allow" | "deny";
    anon_comments: "inherit" | "allow" | "deny";
    show_vote_counts: boolean;
    show_voters: boolean;
    show_dates: boolean;
    post_count: number;
  }[];
  statuses: {
    id: string;
    name: string;
    type: string;
    tone: string;
    position: number;
    show_on_roadmap: boolean;
    is_default: boolean;
    notify_by_default: boolean;
  }[];
  viewer: { id: string; anonymous: boolean; staff: boolean } | null;
}

export function useFeedbackConfig(apiBaseUrl = "") {
  const supabase = useSupabase();
  return useQuery({
    queryKey: feedbackKeys.config(),
    queryFn: () =>
      feedbackApi<PortalConfig>(supabase, "/config", { apiBaseUrl }),
    staleTime: 60_000,
  });
}

export function useBoards() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: feedbackKeys.boards(),
    queryFn: () => listBoards(supabase),
  });
}

export function useStatuses() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: feedbackKeys.statuses(),
    queryFn: () => listStatuses(supabase),
    staleTime: 5 * 60_000,
  });
}

export function useBoardPosts(args: {
  boardId?: string | null;
  sort?: Sort;
  statuses?: string[];
  q?: string;
  page?: number;
}) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: feedbackKeys.posts(args),
    queryFn: () => listPosts(supabase, args),
  });
}

export function usePostFeed(postId: string) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: feedbackKeys.feed(postId),
    enabled: Boolean(postId),
    queryFn: () => getPostFeed(supabase, postId),
  });
}

export function useVoters(postId: string, limit = 15) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: [...feedbackKeys.voters(postId), limit],
    enabled: Boolean(postId),
    queryFn: () => getVoters(supabase, postId, limit),
  });
}

export function useMyVotes(postIds: string[]) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: feedbackKeys.myVotes(postIds),
    enabled: postIds.length > 0,
    queryFn: () => getMyVotes(supabase, postIds),
  });
}

export function useIsFeedbackStaff() {
  const supabase = useSupabase();
  return useQuery({
    queryKey: [...feedbackKeys.staff(), "me"],
    queryFn: () => isStaffViewer(supabase),
    staleTime: 5 * 60_000,
  });
}

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: feedbackKeys.all });

export function useVote(apiBaseUrl = "") {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      postId: string;
      voted: boolean;
      anonAllowed: boolean;
      captchaToken?: string;
    }) => {
      await ensureWriter(supabase, args.anonAllowed, args.captchaToken);
      return feedbackApi<{ voted: boolean; votes: number }>(supabase, "/vote", {
        body: { postId: args.postId, voted: args.voted },
        apiBaseUrl,
      });
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useCreatePost(apiBaseUrl = "") {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      args: CreatePostInput & { anonAllowed: boolean; captchaToken?: string },
    ) => {
      const { anonAllowed, captchaToken, ...body } = args;
      await ensureWriter(supabase, anonAllowed, captchaToken);
      return feedbackApi<{
        id: string;
        slug: string;
        boardSlug: string;
        approvalState: string;
      }>(supabase, "/posts", { body, apiBaseUrl });
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useCreateComment(apiBaseUrl = "") {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      args: CommentInput & { anonAllowed: boolean; captchaToken?: string },
    ) => {
      const { anonAllowed, captchaToken, ...body } = args;
      await ensureWriter(supabase, anonAllowed, captchaToken);
      return feedbackApi<{ id: string }>(supabase, "/comments", {
        body,
        apiBaseUrl,
      });
    },
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: feedbackKeys.feed(v.postId) }),
  });
}

export function useReaction(apiBaseUrl = "") {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      targetType: "comment" | "status_change";
      targetId: string;
      liked: boolean;
      postId: string;
      anonAllowed: boolean;
      captchaToken?: string;
    }) => {
      await ensureWriter(supabase, args.anonAllowed, args.captchaToken);
      return feedbackApi(supabase, "/reactions", {
        body: {
          targetType: args.targetType,
          targetId: args.targetId,
          liked: args.liked,
        },
        apiBaseUrl,
      });
    },
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: feedbackKeys.feed(v.postId) }),
  });
}

export function useSubscribe(apiBaseUrl = "") {
  const supabase = useSupabase();
  return useMutation({
    mutationFn: (args: { postId: string; subscribed: boolean }) =>
      feedbackApi(supabase, "/subscribe", { body: args, apiBaseUrl }),
  });
}

export interface SimilarPost {
  id: string;
  board_id: string;
  slug: string;
  title: string;
  details: string;
  status_id: string | null;
  vote_count: number;
  comment_count: number;
}

export function useSimilarPosts(q: string, boardId?: string, apiBaseUrl = "") {
  const supabase = useSupabase();
  const query = q.trim();
  return useQuery({
    queryKey: ["feedback", "similar", query, boardId ?? null],
    enabled: query.length >= 3,
    staleTime: 30_000,
    queryFn: () => {
      const params = new URLSearchParams({ q: query, limit: "5" });
      if (boardId) params.set("board", boardId);
      return feedbackApi<{ posts: SimilarPost[] }>(
        supabase,
        `/similar?${params.toString()}`,
        { apiBaseUrl },
      ).then((r) => r.posts);
    },
  });
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export function useSetStatus(apiBaseUrl = "") {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: StatusChangeInput) =>
      feedbackApi<{ changeId: string | null }>(supabase, "/staff/status", {
        body: args,
        apiBaseUrl,
      }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdatePost(apiBaseUrl = "") {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: PostUpdateInput) =>
      feedbackApi(supabase, "/staff/update", { body: args, apiBaseUrl }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useMergePost(apiBaseUrl = "") {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { sourceId: string; targetId: string }) =>
      feedbackApi(supabase, "/staff/merge", { body: args, apiBaseUrl }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUnmergePost(apiBaseUrl = "") {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { sourceId: string }) =>
      feedbackApi(supabase, "/staff/unmerge", { body: args, apiBaseUrl }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useVoteOnBehalf(apiBaseUrl = "") {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      postId: string;
      userId: string;
      priority?: "nice" | "important" | "must" | null;
      remove?: boolean;
    }) => feedbackApi(supabase, "/staff/vote", { body: args, apiBaseUrl }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateComment(apiBaseUrl = "") {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      commentId: string;
      body?: string;
      pinned?: boolean;
      deleted?: boolean;
    }) => feedbackApi(supabase, "/staff/comment", { body: args, apiBaseUrl }),
    onSuccess: () => invalidateAll(qc),
  });
}

export interface StaffPerson {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_staff: boolean;
}

export function useStaffPeople(q: string, staffOnly = false, apiBaseUrl = "") {
  const supabase = useSupabase();
  return useQuery({
    queryKey: [...feedbackKeys.staff(), "people", q, staffOnly],
    queryFn: () => {
      const params = new URLSearchParams({ q });
      if (staffOnly) params.set("staff", "1");
      return feedbackApi<{ people: StaffPerson[] }>(
        supabase,
        `/staff/people?${params.toString()}`,
        { apiBaseUrl },
      ).then((r) => r.people);
    },
  });
}

export function useStaffInbox(apiBaseUrl = "") {
  const supabase = useSupabase();
  return useQuery({
    queryKey: feedbackKeys.inbox(),
    queryFn: () =>
      feedbackApi<{
        pending: StaffPost[];
        stale: StaffPost[];
        recent: StaffPost[];
        staleAfterWeeks: number;
      }>(supabase, "/staff/inbox", { apiBaseUrl }),
  });
}

export interface StaffPost {
  id: string;
  board_id: string;
  category_id: string | null;
  status_id: string | null;
  author_id: string | null;
  owner_id: string | null;
  title: string;
  details: string;
  slug: string;
  vote_count: number;
  comment_count: number;
  approval_state: string;
  pinned: boolean;
  merged_into_id: string | null;
  eta: string | null;
  eta_public: boolean;
  source: string;
  status_changed_at: string;
  created_at: string;
}

export function useStaffPosts(
  args: {
    board?: string;
    sort?: Sort;
    status?: string[];
    q?: string;
    page?: number;
  },
  apiBaseUrl = "",
) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: feedbackKeys.staffPosts(args),
    queryFn: () => {
      const params = new URLSearchParams();
      if (args.board) params.set("board", args.board);
      if (args.sort) params.set("sort", args.sort);
      for (const s of args.status ?? []) params.append("status", s);
      if (args.q) params.set("q", args.q);
      if (args.page) params.set("page", String(args.page));
      return feedbackApi<{
        posts: StaffPost[];
        total: number;
        pageSize: number;
      }>(supabase, `/staff/posts?${params.toString()}`, { apiBaseUrl });
    },
  });
}

export function useResyncConfig(apiBaseUrl = "") {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      feedbackApi<{ boards: number; statuses: number; tags: number }>(
        supabase,
        "/staff/resync",
        { body: {}, apiBaseUrl },
      ),
    onSuccess: () => invalidateAll(qc),
  });
}

// ---------------------------------------------------------------------------
// Ideas (staff)
// ---------------------------------------------------------------------------

export interface StaffIdea {
  id: string;
  title: string;
  description: string;
  stage_id: string | null;
  owner_id: string | null;
  eta: string | null;
  eta_public: boolean;
  factor_values: Record<string, number | boolean | null>;
  vote_total: number;
  sync_locked: boolean;
  archived: boolean;
  stage_changed_at: string;
  created_at: string;
  linked_posts: number;
}

export interface IdeaStage {
  id: string;
  name: string;
  type: string;
  tone: string;
  portal_status_id: string | null;
  notify_voters: boolean;
  position: number;
}

export interface IdeasPayload {
  ideas: StaffIdea[];
  stages: IdeaStage[];
  factors: ScoreFactor[];
  stats: {
    idea_id: string;
    voters: number;
    must: number;
    important: number;
    nice: number;
    tags: Record<string, number>;
  }[];
}

export function useStaffIdeas(apiBaseUrl = "") {
  const supabase = useSupabase();
  return useQuery({
    queryKey: [...feedbackKeys.staff(), "ideas"],
    queryFn: () =>
      feedbackApi<IdeasPayload>(supabase, "/staff/ideas", { apiBaseUrl }),
  });
}

export function useIdea(id: string | null, apiBaseUrl = "") {
  const supabase = useSupabase();
  return useQuery({
    queryKey: [...feedbackKeys.staff(), "idea", id],
    enabled: Boolean(id),
    queryFn: () =>
      feedbackApi<{
        idea: StaffIdea;
        posts: {
          id: string;
          title: string;
          slug: string;
          board_id: string;
          status_id: string | null;
          vote_count: number;
          comment_count: number;
        }[];
      }>(supabase, `/staff/idea?id=${encodeURIComponent(id ?? "")}`, {
        apiBaseUrl,
      }),
  });
}

export function useCreateIdea(apiBaseUrl = "") {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      title: string;
      description?: string;
      stageId?: string | null;
      fromPostId?: string | null;
    }) =>
      feedbackApi<{ idea: StaffIdea }>(supabase, "/staff/ideas", {
        body: args,
        apiBaseUrl,
      }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateIdea(apiBaseUrl = "") {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: IdeaUpdateInput) =>
      feedbackApi(supabase, "/staff/ideas/update", { body: args, apiBaseUrl }),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useSetIdeaStage(apiBaseUrl = "") {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      ideaId: string;
      stageId: string;
      message?: string | null;
      notify?: boolean;
    }) =>
      feedbackApi<{ moved: number; notified: number }>(
        supabase,
        "/staff/ideas/stage",
        {
          body: args,
          apiBaseUrl,
        },
      ),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useLinkPost(apiBaseUrl = "") {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { postId: string; ideaId: string | null }) =>
      feedbackApi(supabase, "/staff/link", { body: args, apiBaseUrl }),
    onSuccess: () => invalidateAll(qc),
  });
}

/** Posts in roadmap statuses (public roadmap; native + widgets). */
export function useRoadmapPosts(statusIds: string[], boardIds?: string[]) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["feedback", "roadmap", statusIds, boardIds ?? null],
    enabled: statusIds.length > 0,
    queryFn: () => listRoadmapPosts(supabase, statusIds, boardIds),
  });
}

// ---------------------------------------------------------------------------
// Changelog
// ---------------------------------------------------------------------------

export interface StaffChangelogEntry {
  id: number | string;
  title: string;
  slug: string;
  type: string;
  _status?: "draft" | "published" | null;
  publishedAt?: string | null;
  linkedIdeas?: string[] | null;
  updatedAt: string;
}

export function useStaffChangelog(apiBaseUrl = "") {
  const supabase = useSupabase();
  return useQuery({
    queryKey: [...feedbackKeys.staff(), "changelog"],
    queryFn: () =>
      feedbackApi<{ entries: StaffChangelogEntry[] }>(
        supabase,
        "/staff/changelog",
        {
          apiBaseUrl,
        },
      ).then((r) => r.entries),
  });
}

export function useLinkChangelog(apiBaseUrl = "") {
  const supabase = useSupabase();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      entryId: number | string;
      ideaId: string;
      linked: boolean;
    }) =>
      feedbackApi(supabase, "/staff/changelog/link", {
        body: args,
        apiBaseUrl,
      }),
    onSuccess: () => invalidateAll(qc),
  });
}

export interface WhatsNew {
  entries: {
    id: number | string;
    title: string;
    slug: string;
    type: string;
    excerpt: string | null;
    publishedAt: string | null;
    unread: boolean;
  }[];
  unread: number;
}

export function useWhatsNew(apiBaseUrl = "") {
  const supabase = useSupabase();
  return useQuery({
    queryKey: ["feedback", "whats-new"],
    queryFn: () =>
      feedbackApi<WhatsNew>(supabase, "/changelog/unread", { apiBaseUrl }),
    staleTime: 60_000,
  });
}

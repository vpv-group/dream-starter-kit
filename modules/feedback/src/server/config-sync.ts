import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TablesInsert } from "@acme/api";

import type { AnonRule, BoardAccess, StatusType, Tone } from "../shared/config";
import { slugify } from "../shared/config";

/**
 * Payload → Supabase copy of the feedback configuration (boards,
 * categories, statuses, tags). Payload is the only place they're edited;
 * these rows exist so RLS policies and joins can use them. Pure mapping
 * functions (unit-tested) + idempotent writers: rows that disappear from
 * Payload are ARCHIVED, never deleted, so posts keep their references.
 */

type Db = SupabaseClient<Database>;

export interface BoardDoc {
  id: string | number;
  name: string;
  slug: string;
  description?: string | null;
  _order?: string | null;
  access?: BoardAccess | null;
  segmentTags?: string[] | null;
  showOnPortalHome?: boolean | null;
  searchIndexing?: boolean | null;
  allowNewPosts?: boolean | null;
  anonVotes?: AnonRule | null;
  anonPosts?: AnonRule | null;
  anonComments?: AnonRule | null;
  requireApproval?: boolean | null;
  showVoteCounts?: boolean | null;
  showVoters?: boolean | null;
  showDates?: boolean | null;
  showCommentsPublicly?: boolean | null;
  disableVotesWhenDone?: boolean | null;
  disableCommentsWhenDone?: boolean | null;
  titleLabel?: string | null;
  titlePlaceholder?: string | null;
  detailsLabel?: string | null;
  detailsPlaceholder?: string | null;
  submitLabel?: string | null;
  allowAttachments?: boolean | null;
  customFields?:
    | {
        key?: string | null;
        label: string;
        required?: boolean | null;
        type?: "text" | "textarea" | "select" | null;
        placeholder?: string | null;
        options?: string[] | null;
      }[]
    | null;
  categories?:
    | {
        key?: string | null;
        name: string;
        subcategories?: { key?: string | null; name: string }[] | null;
      }[]
    | null;
}

export interface BoardForm {
  titleLabel: string;
  titlePlaceholder: string;
  detailsLabel: string;
  detailsPlaceholder: string;
  submitLabel: string;
  allowAttachments: boolean;
  customFields: {
    key: string;
    label: string;
    required: boolean;
    type: "text" | "textarea" | "select";
    placeholder: string;
    options: string[];
  }[];
}

/** Trimmed text, or the fallback when it's empty or unset. */
const textOr = (value: string | null | undefined, fallback: string): string => {
  const t = value?.trim();
  // An empty string must fall back too, so `??` isn't enough here.
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  return t ? t : fallback;
};

export function boardForm(doc: BoardDoc): BoardForm {
  return {
    titleLabel: textOr(doc.titleLabel, "Title"),
    titlePlaceholder: textOr(doc.titlePlaceholder, "Short, descriptive title"),
    detailsLabel: textOr(doc.detailsLabel, "Details"),
    detailsPlaceholder: textOr(
      doc.detailsPlaceholder,
      "Any additional details…",
    ),
    submitLabel: textOr(doc.submitLabel, "Create Post"),
    allowAttachments: doc.allowAttachments ?? true,
    customFields: (doc.customFields ?? []).slice(0, 3).map((f) => ({
      key: textOr(f.key, slugify(f.label)),
      label: f.label,
      required: Boolean(f.required),
      type: f.type ?? "text",
      placeholder: f.placeholder ?? "",
      options: f.options ?? [],
    })),
  };
}

export function boardRow(
  doc: BoardDoc,
  position: number,
): TablesInsert<"mod_feedback_boards"> {
  return {
    id: String(doc.id),
    slug: doc.slug,
    name: doc.name,
    description: doc.description ?? null,
    position,
    access: doc.access ?? "staff",
    segment_tags: doc.segmentTags ?? [],
    show_on_portal_home: doc.showOnPortalHome ?? true,
    search_indexing: doc.searchIndexing ?? false,
    allow_new_posts: doc.allowNewPosts ?? true,
    anon_votes: doc.anonVotes ?? "inherit",
    anon_posts: doc.anonPosts ?? "inherit",
    anon_comments: doc.anonComments ?? "inherit",
    require_approval: doc.requireApproval ?? false,
    show_vote_counts: doc.showVoteCounts ?? true,
    show_voters: doc.showVoters ?? true,
    show_dates: doc.showDates ?? true,
    show_comments_publicly: doc.showCommentsPublicly ?? true,
    disable_votes_when_done: doc.disableVotesWhenDone ?? false,
    disable_comments_when_done: doc.disableCommentsWhenDone ?? false,
    form: boardForm(
      doc,
    ) as unknown as TablesInsert<"mod_feedback_boards">["form"],
    archived: false,
    synced_at: new Date().toISOString(),
  };
}

/** Categories (and one level of subcategories) of a board, keyed `<board>:<key>`. */
export function categoryRows(
  doc: BoardDoc,
): TablesInsert<"mod_feedback_categories">[] {
  const boardId = String(doc.id);
  const rows: TablesInsert<"mod_feedback_categories">[] = [];
  (doc.categories ?? []).forEach((c, i) => {
    const key = textOr(c.key, slugify(c.name));
    const id = `${boardId}:${key}`;
    rows.push({
      id,
      board_id: boardId,
      parent_id: null,
      name: c.name,
      slug: key,
      position: i,
      archived: false,
    });
    (c.subcategories ?? []).forEach((s, j) => {
      const subKey = textOr(s.key, slugify(s.name));
      rows.push({
        id: `${id}/${subKey}`,
        board_id: boardId,
        parent_id: id,
        name: s.name,
        slug: `${key}-${subKey}`,
        position: j,
        archived: false,
      });
    });
  });
  return rows;
}

export interface StatusInput {
  key?: string | null;
  name: string;
  type: StatusType;
  tone?: Tone | null;
  showOnRoadmap?: boolean | null;
  isDefault?: boolean | null;
  notifyVotersByDefault?: boolean | null;
}

export function statusRows(
  statuses: StatusInput[],
): TablesInsert<"mod_feedback_statuses">[] {
  return statuses.map((s, i) => ({
    id: textOr(s.key, slugify(s.name)),
    name: s.name,
    type: s.type,
    tone: s.tone ?? "neutral",
    position: i,
    show_on_roadmap: Boolean(s.showOnRoadmap),
    is_default: Boolean(s.isDefault),
    notify_by_default: s.notifyVotersByDefault ?? true,
    archived: false,
  }));
}

export interface IdeaStageInput {
  key?: string | null;
  name: string;
  type: StatusType;
  tone?: Tone | null;
  portalStatus?: string | null;
  notifyVoters?: boolean | null;
}

/** Stages keep a portal status only when that status exists (else null). */
export function ideaStageRows(
  stages: IdeaStageInput[],
  statusIds: Set<string>,
): TablesInsert<"mod_feedback_idea_stages">[] {
  return stages.map((st, i) => ({
    id: textOr(st.key, slugify(st.name)),
    name: st.name,
    type: st.type,
    tone: st.tone ?? "neutral",
    portal_status_id:
      st.portalStatus && statusIds.has(st.portalStatus)
        ? st.portalStatus
        : null,
    notify_voters: st.notifyVoters ?? true,
    position: i,
    archived: false,
  }));
}

export function tagRows(
  tags: { key?: string | null; name: string; tone?: Tone | null }[],
): TablesInsert<"mod_feedback_tags">[] {
  return tags.map((t, i) => ({
    id: textOr(t.key, slugify(t.name)),
    name: t.name,
    tone: t.tone ?? "neutral",
    position: i,
    archived: false,
  }));
}

/** Postgres `not in (...)` list for PostgREST. */
function notIn(ids: string[]): string {
  return `(${ids.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(",")})`;
}

async function check<T extends { error: { message: string } | null }>(
  op: PromiseLike<T>,
  what: string,
): Promise<T> {
  const res = await op;
  if (res.error) throw new Error(`[feedback] ${what}: ${res.error.message}`);
  return res;
}

/** Upsert one board + its categories; archive categories it no longer has. */
export async function writeBoard(
  db: Db,
  doc: BoardDoc,
  position: number,
): Promise<void> {
  await check(
    db.from("mod_feedback_boards").upsert(boardRow(doc, position)),
    "upsert board",
  );
  const cats = categoryRows(doc);
  // Parents before children (parent_id FK).
  const parents = cats.filter((c) => !c.parent_id);
  const children = cats.filter((c) => c.parent_id);
  if (parents.length) {
    await check(
      db.from("mod_feedback_categories").upsert(parents),
      "upsert categories",
    );
  }
  if (children.length) {
    await check(
      db.from("mod_feedback_categories").upsert(children),
      "upsert subcategories",
    );
  }
  let stale = db
    .from("mod_feedback_categories")
    .update({ archived: true })
    .eq("board_id", String(doc.id));
  if (cats.length) stale = stale.not("id", "in", notIn(cats.map((c) => c.id)));
  await check(stale, "archive categories");
}

export async function archiveBoard(db: Db, id: string | number): Promise<void> {
  await check(
    db
      .from("mod_feedback_boards")
      .update({ archived: true })
      .eq("id", String(id)),
    "archive board",
  );
}

/** Upsert every board; archive boards that no longer exist in Payload. */
export async function writeAllBoards(db: Db, docs: BoardDoc[]): Promise<void> {
  for (const [i, doc] of docs.entries()) await writeBoard(db, doc, i);
  let stale = db.from("mod_feedback_boards").update({ archived: true });
  stale = docs.length
    ? stale.not("id", "in", notIn(docs.map((d) => String(d.id))))
    : stale.neq("id", "");
  await check(stale, "archive boards");
}

export async function writeStatuses(
  db: Db,
  statuses: StatusInput[],
): Promise<void> {
  const rows = statusRows(statuses);
  if (!rows.length) return;
  await check(db.from("mod_feedback_statuses").upsert(rows), "upsert statuses");
  await check(
    db
      .from("mod_feedback_statuses")
      .update({ archived: true, is_default: false, show_on_roadmap: false })
      .not("id", "in", notIn(rows.map((r) => r.id))),
    "archive statuses",
  );
}

export async function writeIdeaStages(
  db: Db,
  stages: IdeaStageInput[],
  statuses: StatusInput[],
): Promise<void> {
  const rows = ideaStageRows(
    stages,
    new Set(statusRows(statuses).map((r) => r.id)),
  );
  if (!rows.length) return;
  await check(
    db.from("mod_feedback_idea_stages").upsert(rows),
    "upsert idea stages",
  );
  await check(
    db
      .from("mod_feedback_idea_stages")
      .update({ archived: true })
      .not("id", "in", notIn(rows.map((r) => r.id))),
    "archive idea stages",
  );
}

export async function writeTags(
  db: Db,
  tags: { key?: string | null; name: string; tone?: Tone | null }[],
): Promise<void> {
  const rows = tagRows(tags);
  if (rows.length) {
    await check(db.from("mod_feedback_tags").upsert(rows), "upsert tags");
  }
  let stale = db.from("mod_feedback_tags").update({ archived: true });
  stale = rows.length
    ? stale.not("id", "in", notIn(rows.map((r) => r.id)))
    : stale.neq("id", "");
  await check(stale, "archive tags");
}

/**
 * Which sites may frame /embed/feedback (the Widget tab). Disabled or empty
 * → none, so only the app itself can show the embed pages.
 */
export async function writeEmbedOrigins(
  db: Db,
  enabled: boolean | null | undefined,
  origins: string[],
): Promise<void> {
  await check(
    db.rpc("kit_set_embed_origins", {
      _module: "feedback",
      _origins: enabled ? origins : [],
    }),
    "embed origins",
  );
}

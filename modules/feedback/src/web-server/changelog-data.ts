import "server-only";

import type { Where } from "payload";

import type { Portal } from "./portal-data";
import { createAdminClient } from "../server/admin-client";

export interface EntryView {
  id: number | string;
  title: string;
  slug: string;
  type: "new" | "improved" | "fixed";
  excerpt: string | null;
  body: unknown;
  publishedAt: string;
  labels: { id: number | string; name: string; tone: string }[];
  hero: { url: string; alt: string } | null;
  audience: "everyone" | "members";
  linkedIdeas: string[];
}

type Doc = Record<string, unknown> & { id: number | string };

function toView(d: Doc): EntryView {
  const labels = ((d.labels as unknown[] | null) ?? [])
    .filter((l): l is { id: number | string; name: string; tone?: string } =>
      Boolean(l && typeof l === "object"),
    )
    .map((l) => ({ id: l.id, name: l.name, tone: l.tone ?? "neutral" }));
  const hero = d.heroImage as {
    url?: string | null;
    alt?: string | null;
  } | null;
  return {
    id: d.id,
    title: String(d.title),
    slug: String(d.slug),
    type: (d.type as EntryView["type"] | undefined) ?? "new",
    excerpt: (d.excerpt as string | null | undefined) ?? null,
    body: d.body,
    publishedAt: String(d.publishedAt ?? d.createdAt),
    labels,
    hero: hero?.url ? { url: hero.url, alt: hero.alt ?? "" } : null,
    audience: (d.audience as EntryView["audience"] | undefined) ?? "everyone",
    linkedIdeas: (d.linkedIdeas as string[] | null | undefined) ?? [],
  };
}

/** Published entries the viewer may see (members-only needs an account). */
export async function listEntries(
  portal: Portal,
  args: {
    type?: string | null;
    labels?: string[];
    q?: string | null;
    limit: number;
  },
): Promise<EntryView[]> {
  const members = Boolean(portal.viewer && !portal.viewer.anonymous);
  const and: Where[] = [{ _status: { equals: "published" } }];
  if (!members) and.push({ audience: { equals: "everyone" } });
  if (args.type) and.push({ type: { equals: args.type } });
  if (args.labels?.length) and.push({ labels: { in: args.labels } });
  if (args.q) {
    and.push({
      or: [{ title: { like: args.q } }, { excerpt: { like: args.q } }],
    });
  }
  const res = await portal.payload.find({
    collection: "mod-feedback-changelog",
    where: { and },
    sort: "-publishedAt",
    limit: args.limit,
    depth: 1,
    overrideAccess: true,
  });
  return (res.docs as unknown as Doc[]).map(toView);
}

export async function getEntry(
  portal: Portal,
  slug: string,
): Promise<EntryView | null> {
  const members = Boolean(portal.viewer && !portal.viewer.anonymous);
  const res = await portal.payload.find({
    collection: "mod-feedback-changelog",
    where: {
      and: [
        { slug: { equals: slug } },
        { _status: { equals: "published" } },
        ...(members ? [] : [{ audience: { equals: "everyone" } } as Where]),
      ],
    },
    limit: 1,
    depth: 1,
    overrideAccess: true,
  });
  const doc = res.docs[0] as unknown as Doc | undefined;
  return doc ? toView(doc) : null;
}

export async function listLabels(portal: Portal) {
  const res = await portal.payload.find({
    collection: "mod-feedback-changelog-labels",
    sort: "_order",
    limit: 100,
    depth: 0,
  });
  return res.docs.map((l) => ({ id: String(l.id), name: l.name }));
}

export interface EntryExtras {
  likes: Map<string, { likes: number; mine: boolean }>;
  /** Sum of votes on the ideas an entry shipped ("Requested by N"). */
  requestedBy: Map<string, number>;
}

export async function entryExtras(
  portal: Portal,
  entries: EntryView[],
): Promise<EntryExtras> {
  const ids = entries.map((e) => String(e.id));
  const ideaIds = [...new Set(entries.flatMap((e) => e.linkedIdeas))];
  const [likes, ideas] = await Promise.all([
    ids.length
      ? portal.db.rpc("mod_feedback_changelog_likes", { _entries: ids })
      : Promise.resolve({
          data: [] as { entry_id: string; likes: number; mine: boolean }[],
        }),
    // Ideas are staff-only; only their public vote totals are read here.
    ideaIds.length
      ? createAdminClient()
          .from("mod_feedback_ideas")
          .select("id, vote_total")
          .in("id", ideaIds)
      : Promise.resolve({ data: [] as { id: string; vote_total: number }[] }),
  ]);
  const totals = new Map((ideas.data ?? []).map((i) => [i.id, i.vote_total]));
  return {
    likes: new Map(
      (likes.data ?? []).map((l) => [
        l.entry_id,
        { likes: Number(l.likes), mine: Boolean(l.mine) },
      ]),
    ),
    requestedBy: new Map(
      entries.map((e) => [
        String(e.id),
        e.linkedIdeas.reduce((n, id) => n + (totals.get(id) ?? 0), 0),
      ]),
    ),
  };
}

export async function isChangelogSubscriber(portal: Portal): Promise<boolean> {
  if (!portal.viewer || portal.viewer.anonymous) return false;
  const { data } = await portal.db
    .from("mod_feedback_changelog_subscribers")
    .select("user_id")
    .eq("user_id", portal.viewer.id)
    .maybeSingle();
  return Boolean(data);
}

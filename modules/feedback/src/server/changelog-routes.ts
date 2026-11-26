import "server-only";

import type { BasePayload } from "payload";
import { z } from "zod/v4";

import type { ModPublicRouteTable, ModRouteTable } from "@acme/mod-kit/server";
import { getModuleSettings } from "@acme/mod-kit/payload";

import type { FeedbackSettings } from "../payload/settings";
import { settings as settingsDef } from "../payload/settings";
import { CHANGELOG_TYPE_META } from "../shared/changelog";
import { effectiveAnon } from "../shared/config";
import { createAdminClient } from "./admin-client";
import { handle, HttpError, json, must, ok, parseBody } from "./http";
import { lexicalToHtml } from "./lexical-html";

/**
 * Changelog routes. Entries are Payload docs (mod-feedback-changelog); the
 * likes, subscriptions and read markers live in Supabase.
 *   Public: GET /changelog/rss.xml (RSS 2.0), POST /changelog/react,
 *   POST /changelog/subscribe, POST /changelog/seen, GET /changelog/unread.
 *   Staff:  GET /staff/changelog, POST /staff/changelog/link.
 */

export interface RssEntry {
  id: string | number;
  title: string;
  slug: string;
  type?: string | null;
  excerpt?: string | null;
  body?: unknown;
  publishedAt?: string | null;
  createdAt: string;
  labels?: ({ name?: string } | number | string)[] | null;
  heroImage?:
    | {
        url?: string | null;
        mimeType?: string | null;
        filesize?: number | null;
      }
    | number
    | null;
}

const xml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const cdata = (s: string) =>
  `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

/** RSS 2.0 for published, everyone-audience entries (pure; unit-tested). */
export function buildRss(args: {
  siteUrl: string;
  title: string;
  description: string;
  entries: RssEntry[];
  bodyHtml?: (body: unknown) => string;
}): string {
  const base = args.siteUrl.replace(/\/$/, "");
  const items = args.entries
    .map((e) => {
      const link = `${base}/changelog/${e.slug}`;
      const date = new Date(e.publishedAt ?? e.createdAt).toUTCString();
      const categories = [
        e.type && e.type in CHANGELOG_TYPE_META
          ? CHANGELOG_TYPE_META[e.type as keyof typeof CHANGELOG_TYPE_META]
              .label
          : null,
        ...(e.labels ?? []).map((l) =>
          typeof l === "object" ? (l.name ?? null) : null,
        ),
      ].filter((c): c is string => Boolean(c));
      const html = [
        e.excerpt ? `<p>${xml(e.excerpt)}</p>` : "",
        e.body && args.bodyHtml ? args.bodyHtml(e.body) : "",
      ].join("");
      const hero =
        e.heroImage && typeof e.heroImage === "object" && e.heroImage.url
          ? `<enclosure url="${xml(e.heroImage.url.startsWith("http") ? e.heroImage.url : `${base}${e.heroImage.url}`)}" type="${xml(e.heroImage.mimeType ?? "image/jpeg")}" length="${e.heroImage.filesize ?? 0}"/>`
          : "";
      return [
        "<item>",
        `<title>${xml(e.title)}</title>`,
        `<link>${xml(link)}</link>`,
        `<guid isPermaLink="true">${xml(link)}</guid>`,
        `<pubDate>${date}</pubDate>`,
        ...categories.map((c) => `<category>${xml(c)}</category>`),
        `<description>${cdata(html || xml(e.title))}</description>`,
        hero,
        "</item>",
      ].join("");
    })
    .join("");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `<title>${xml(args.title)}</title>`,
    `<link>${xml(`${base}/changelog`)}</link>`,
    `<description>${xml(args.description)}</description>`,
    `<atom:link href="${xml(`${base}/api/mod/feedback/changelog/rss.xml`)}" rel="self" type="application/rss+xml"/>`,
    items,
    "</channel>",
    "</rss>",
  ].join("");
}

function siteUrlFrom(req: Request): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
}

async function loadSettings(getPayload: () => Promise<BasePayload>) {
  return getModuleSettings<FeedbackSettings>(await getPayload(), settingsDef);
}

const entryIdInput = z.object({
  entryId: z.union([z.string(), z.number()]).transform(String),
  liked: z.boolean(),
});

export const changelogPublicRoutes: ModPublicRouteTable = {
  "GET /changelog/rss.xml": handle(async (req, ctx) => {
    const payload = await ctx.getPayload();
    const s = await loadSettings(ctx.getPayload);
    if (s.changelogRss === false) return json(404, { error: "Not found" });
    const res = await payload.find({
      collection: "mod-feedback-changelog",
      where: {
        and: [
          { _status: { equals: "published" } },
          { audience: { equals: "everyone" } },
        ],
      },
      sort: "-publishedAt",
      limit: 50,
      depth: 1,
      overrideAccess: true,
    });
    const body = buildRss({
      siteUrl: siteUrlFrom(req),
      title: s.changelogTitle ?? "Changelog",
      description: s.changelogSubtitle ?? "Product updates",
      entries: res.docs,
      bodyHtml: lexicalToHtml,
    });
    return new Response(body, {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    });
  }),

  /** Like / unlike an entry (anonymous visitors follow the vote rule). */
  "POST /changelog/react": handle(async (req, ctx) => {
    if (!ctx.user)
      throw new HttpError(401, "Sign in to continue.", "auth_required");
    const input = await parseBody(req, entryIdInput);
    const s = await loadSettings(ctx.getPayload);
    let db = ctx.supabase;
    if (ctx.user.is_anonymous) {
      if (!effectiveAnon("inherit", s.anonVotes ?? true)) {
        throw new HttpError(401, "Sign in to continue.", "auth_required");
      }
      db = createAdminClient();
    }
    if (input.liked) {
      const { error } = await db
        .from("mod_feedback_changelog_reactions")
        .insert({ entry_id: input.entryId, user_id: ctx.user.id });
      if (error && error.code !== "23505") throw error;
    } else {
      must(
        await db
          .from("mod_feedback_changelog_reactions")
          .delete()
          .eq("entry_id", input.entryId)
          .eq("user_id", ctx.user.id),
      );
    }
    return ok({ liked: input.liked });
  }),

  /** Subscribe to changelog emails (signed-in, non-anonymous). */
  "POST /changelog/subscribe": handle(async (req, ctx) => {
    if (!ctx.user || ctx.user.is_anonymous) {
      throw new HttpError(401, "Sign in to subscribe.", "auth_required");
    }
    const input = await parseBody(req, z.object({ subscribed: z.boolean() }));
    if (input.subscribed) {
      const { error } = await ctx.supabase
        .from("mod_feedback_changelog_subscribers")
        .insert({ user_id: ctx.user.id });
      if (error && error.code !== "23505") throw error;
    } else {
      must(
        await ctx.supabase
          .from("mod_feedback_changelog_subscribers")
          .delete()
          .eq("user_id", ctx.user.id),
      );
    }
    return ok({ subscribed: input.subscribed });
  }),

  /** Mark the changelog read (clears the What's new dot). */
  "POST /changelog/seen": handle(async (_req, ctx) => {
    if (!ctx.user || ctx.user.is_anonymous) return ok({ seen: false });
    must(
      await ctx.supabase.from("mod_feedback_changelog_reads").upsert({
        user_id: ctx.user.id,
        last_seen_at: new Date().toISOString(),
      }),
    );
    return ok({ seen: true });
  }),

  /** Latest entries + whether there's anything new since the last read. */
  "GET /changelog/unread": handle(async (_req, ctx) => {
    const payload = await ctx.getPayload();
    const members = Boolean(ctx.user && !ctx.user.is_anonymous);
    const res = await payload.find({
      collection: "mod-feedback-changelog",
      where: {
        and: [
          { _status: { equals: "published" } },
          ...(members ? [] : [{ audience: { equals: "everyone" } }]),
        ],
      },
      sort: "-publishedAt",
      limit: 5,
      depth: 0,
      overrideAccess: true,
      select: {
        title: true,
        slug: true,
        type: true,
        excerpt: true,
        publishedAt: true,
      },
    });
    let lastSeen: string | null = null;
    if (members && ctx.user) {
      const { data } = await ctx.supabase
        .from("mod_feedback_changelog_reads")
        .select("last_seen_at")
        .eq("user_id", ctx.user.id)
        .maybeSingle();
      lastSeen = data?.last_seen_at ?? null;
    }
    const entries = res.docs.map((d) => ({
      id: d.id,
      title: d.title,
      slug: d.slug,
      type: d.type,
      excerpt: d.excerpt ?? null,
      publishedAt: d.publishedAt ?? null,
      unread: Boolean(d.publishedAt && (!lastSeen || d.publishedAt > lastSeen)),
    }));
    return ok({ entries, unread: entries.filter((e) => e.unread).length });
  }),
};

async function requireStaffRoute(ctx: {
  supabase: {
    rpc: (fn: "mod_feedback_is_staff") => PromiseLike<{ data: unknown }>;
  };
}) {
  const { data } = await ctx.supabase.rpc("mod_feedback_is_staff");
  if (!data) throw new HttpError(403, "Staff only.", "forbidden");
}

export const changelogStaffRoutes: ModRouteTable = {
  /** Entries for the staff workspace + idea linking. */
  "GET /staff/changelog": handle(async (_req, ctx) => {
    await requireStaffRoute(ctx);
    const payload = await ctx.getPayload();
    const res = await payload.find({
      collection: "mod-feedback-changelog",
      sort: "-updatedAt",
      limit: 100,
      depth: 0,
      draft: true,
      overrideAccess: true,
      select: {
        title: true,
        slug: true,
        type: true,
        _status: true,
        publishedAt: true,
        linkedIdeas: true,
        updatedAt: true,
      },
    });
    return ok({ entries: res.docs });
  }),

  /** Link / unlink an idea on an entry (shipped on the entry's first publish). */
  "POST /staff/changelog/link": handle(async (req, ctx) => {
    await requireStaffRoute(ctx);
    const input = await parseBody(
      req,
      z.object({
        entryId: z.union([z.string(), z.number()]),
        ideaId: z.uuid(),
        linked: z.boolean(),
      }),
    );
    const payload = await ctx.getPayload();
    const entry = await payload.findByID({
      collection: "mod-feedback-changelog",
      id: input.entryId,
      draft: true,
      overrideAccess: true,
      depth: 0,
    });
    const current = new Set(entry.linkedIdeas ?? []);
    if (input.linked) current.add(input.ideaId);
    else current.delete(input.ideaId);
    await payload.update({
      collection: "mod-feedback-changelog",
      id: input.entryId,
      data: { linkedIdeas: [...current] },
      // Linking must never publish or announce the entry by itself.
      draft: entry._status !== "published",
      context: { skipChangelogAnnounce: true },
      overrideAccess: true,
    });
    return ok({ linkedIdeas: [...current] });
  }),
};

import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

// Terms of Service and Privacy Policy moved from the block-composed `pages`
// collection (slugs `terms`/`privacy`) into the dedicated `legal` collection
// (slugs `terms-of-service`/`privacy-policy`, rendered under /legal with a
// table-of-contents sidebar). This migration performs the DATA move on
// already-seeded databases — fresh installs get the legal docs from the seed
// and this is a no-op. It also rewrites the two globals that store the old
// URLs (site-settings footer policies, authentication-settings terms/privacy
// links) — only values still exactly equal to the old defaults are touched,
// so staff-customized links survive.

const MOVES = [
  { oldSlug: "terms", newSlug: "terms-of-service", order: 1 },
  { oldSlug: "privacy", newSlug: "privacy-policy", order: 2 },
] as const;

const URL_REWRITES: Record<string, string> = {
  "/terms": "/legal/terms-of-service",
  "/privacy": "/legal/privacy-policy",
};

interface LexicalNode extends Record<string, unknown> {
  type: string;
  version: number;
}
interface LexicalState extends Record<string, unknown> {
  root: {
    type: string;
    children: LexicalNode[];
    direction: "ltr" | "rtl" | null;
    format: "" | "left" | "start" | "center" | "right" | "end" | "justify";
    indent: number;
    version: number;
  };
}

const isLexical = (value: unknown): value is LexicalState =>
  typeof value === "object" &&
  value !== null &&
  "root" in value &&
  typeof (value as LexicalState).root === "object";

/** Merge the rich-text of every `prose` block in a page layout into one body. */
function proseContent(layout: unknown, pageTitle: string): LexicalState | null {
  if (!Array.isArray(layout)) return null;
  const children: LexicalNode[] = [];
  let base: LexicalState | null = null;
  for (const block of layout as {
    blockType?: string;
    title?: string | null;
    content?: unknown;
  }[]) {
    if (block.blockType !== "prose" || !isLexical(block.content)) continue;
    base ??= block.content;
    // Keep a prose section's own heading unless it just repeats the doc title.
    if (block.title && block.title !== pageTitle) {
      children.push({
        type: "heading",
        tag: "h2",
        format: "",
        indent: 0,
        version: 1,
        direction: "ltr",
        children: [
          {
            type: "text",
            text: block.title,
            format: 0,
            detail: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
        ],
      });
    }
    children.push(...block.content.root.children);
  }
  if (!base || children.length === 0) return null;
  return { root: { ...base.root, children } };
}

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  for (const move of MOVES) {
    const { docs } = await payload.find({
      collection: "pages",
      where: { slug: { equals: move.oldSlug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    });
    const page = docs[0];
    if (!page) continue; // fresh install (seed creates the legal docs) or already moved

    const { totalDocs: already } = await payload.find({
      collection: "legal",
      where: { slug: { equals: move.newSlug } },
      limit: 0,
      overrideAccess: true,
      req,
    });
    if (already === 0) {
      const fallback: LexicalState = {
        root: {
          type: "root",
          format: "",
          indent: 0,
          version: 1,
          direction: "ltr",
          children: [
            {
              type: "paragraph",
              format: "",
              indent: 0,
              version: 1,
              direction: "ltr",
              children: [],
            },
          ],
        },
      };
      const content = proseContent(page.layout, page.title) ?? fallback;
      await payload.create({
        collection: "legal",
        data: {
          title: page.title,
          slug: move.newSlug,
          order: move.order,
          content,
          _status: page._status === "draft" ? "draft" : "published",
          ...(page.meta ? { meta: page.meta } : {}),
        },
        overrideAccess: true,
        req,
      });
    }

    // Permanently remove the old page — /terms and /privacy now redirect to
    // the /legal routes (next.config), so nothing links here anymore.
    await payload.delete({
      collection: "pages",
      id: page.id,
      overrideAccess: true,
      req,
    });
  }

  // Rewrite stored links that still point at the old top-level routes.
  const site = await payload.findGlobal({
    slug: "site-settings",
    depth: 0,
    overrideAccess: true,
    req,
  });
  const policies = site.footerPolicies ?? [];
  if (policies.some((p) => p.url in URL_REWRITES)) {
    await payload.updateGlobal({
      slug: "site-settings",
      data: {
        footerPolicies: policies.map((p) => ({
          ...p,
          url: URL_REWRITES[p.url] ?? p.url,
        })),
      },
      overrideAccess: true,
      req,
    });
  }

  // authentication-settings: plain SQL, NOT the Local API. The Local API
  // queries with the CURRENT config, so on a fresh database it would select
  // columns/tables that later migrations add to this global (e.g. the
  // Account model tab) and fail before those migrations run.
  for (const [from, to] of Object.entries(URL_REWRITES)) {
    await db.execute(
      sql`update "cms"."authentication_settings" set "terms_url" = ${to} where "terms_url" = ${from}`,
    );
    await db.execute(
      sql`update "cms"."authentication_settings" set "privacy_url" = ${to} where "privacy_url" = ${from}`,
    );
  }
}

export async function down({ payload, req }: MigrateDownArgs): Promise<void> {
  // Remove the migrated legal docs. The original `pages` rows are not
  // recreated (their block layout was flattened on the way in) — restore them
  // from the admin if needed.
  for (const move of MOVES) {
    const { docs } = await payload.find({
      collection: "legal",
      where: { slug: { equals: move.newSlug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    });
    if (docs[0]) {
      await payload.delete({
        collection: "legal",
        id: docs[0].id,
        overrideAccess: true,
        req,
      });
    }
  }
}

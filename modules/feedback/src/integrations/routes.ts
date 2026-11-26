import "server-only";

import type { BasePayload } from "payload";
import { after } from "next/server";
import { z } from "zod/v4";

import type {
  ModPublicRouteContext,
  ModPublicRouteTable,
  ModRouteContext,
  ModRouteTable,
} from "@acme/mod-kit/server";
import { isCronRequest } from "@acme/mod-kit/cron";

import type {
  IssueTrackerProvider,
  ProviderContext,
  ProviderSettings,
} from "./types";
import { createAdminClient } from "../server/admin-client";
import { handle, HttpError, json, must, ok, parseBody } from "../server/http";
import { drainOutbox, pollProvider } from "./engine";
import { ProviderError } from "./types";

/**
 * The standard issue-tracker routes, shared by the built-in GitHub provider
 * and adapter modules (feedback-adapter-<tool>): the idea sheet's issue panel
 * calls `<route_base>/status|search|link|create|unlink|sync`, where
 * route_base is the provider's row in mod_feedback_integrations.
 * Staff-only (checked in SQL via mod_feedback_is_staff + RLS on the links).
 */

export interface TrackerRouteOptions {
  provider: IssueTrackerProvider;
  /** Route-key prefix inside the owning module, e.g. "/integrations/github". */
  base: string;
  loadSettings: (
    getPayload: () => Promise<BasePayload>,
  ) => Promise<ProviderSettings>;
}

const siteUrl = (req: Request) =>
  process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

async function providerContext(
  opts: TrackerRouteOptions,
  ctx: Pick<ModRouteContext, "host" | "getPayload">,
  req: Request,
): Promise<ProviderContext> {
  return {
    host: ctx.host,
    db: createAdminClient(),
    settings: await opts.loadSettings(ctx.getPayload),
    siteUrl: siteUrl(req),
  };
}

async function requireStaff(ctx: ModRouteContext) {
  const { data } = await ctx.supabase.rpc("mod_feedback_is_staff");
  if (!data) throw new HttpError(403, "Staff only.", "forbidden");
}

/** Map provider errors (not connected, forbidden) onto HTTP errors. */
function providerHandle(
  fn: (req: Request, ctx: ModRouteContext) => Promise<Response>,
) {
  return handle(async (req: Request, ctx: ModRouteContext) => {
    try {
      await requireStaff(ctx);
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof ProviderError) {
        return json(
          err.status === 503 ? 503 : err.status >= 500 ? 502 : err.status,
          {
            error: err.message,
            code: err.code,
          },
        );
      }
      throw err;
    }
  });
}

/** Issue body for "Create issue": the idea, its posts and vote total. */
async function issueBody(ideaId: string, site: string, ctx: ModRouteContext) {
  const { data: idea } = await ctx.supabase
    .from("mod_feedback_ideas")
    .select("title, description, vote_total")
    .eq("id", ideaId)
    .single();
  const { data: posts } = await ctx.supabase
    .from("mod_feedback_posts")
    .select("title, slug, vote_count, board:mod_feedback_boards!inner(slug)")
    .eq("idea_id", ideaId)
    .is("deleted_at", null)
    .order("vote_count", { ascending: false })
    .limit(10);
  if (!idea) throw new HttpError(404, "Idea not found.");
  const lines = [
    idea.description || "_No description yet._",
    "",
    `**${idea.vote_total} votes** from customer feedback:`,
    ...(posts ?? []).map((p) => {
      const board = p.board;
      return `- [${p.title}](${site}/feedback/${board.slug}/p/${p.slug}) — ${p.vote_count} votes`;
    }),
  ];
  return { title: idea.title, body: lines.join("\n"), votes: idea.vote_total };
}

const backlinkText = (site: string, ideaId: string, votes: number) =>
  `🔗 Linked to a feedback idea with **${votes} votes** — ${site}/a/feedback?idea=${ideaId}\n\n_Status syncs both ways with the idea (Dream feedback)._`;

export function createIssueTrackerRoutes(opts: TrackerRouteOptions): {
  routes: ModRouteTable;
  publicRoutes: ModPublicRouteTable;
} {
  const { provider, base } = opts;
  const p = (path: string) => `${base}${path}`;

  const linkIssue = async (
    req: Request,
    ctx: ModRouteContext,
    ideaId: string,
    externalId: string,
    created: boolean,
  ) => {
    const pctx = await providerContext(opts, ctx, req);
    const issue = await provider.get(pctx, externalId);
    const link = must(
      await ctx.supabase
        .from("mod_feedback_issue_links")
        .insert({
          idea_id: ideaId,
          provider: provider.id,
          external_id: issue.externalId,
          key: issue.key,
          url: issue.url,
          title: issue.title,
          state_category: issue.state.category,
          state_raw: issue.state.raw,
          labels: issue.labels,
          linked_by: ctx.user.id,
          last_synced_at: new Date().toISOString(),
        })
        .select("*")
        .single(),
    );
    if (pctx.settings.backlinkComment) {
      const { data: idea } = await ctx.supabase
        .from("mod_feedback_ideas")
        .select("vote_total")
        .eq("id", ideaId)
        .single();
      after(async () => {
        try {
          const { commentId } = await provider.upsertBacklink(
            pctx,
            issue.externalId,
            backlinkText(pctx.siteUrl, ideaId, idea?.vote_total ?? 0),
          );
          await pctx.db
            .from("mod_feedback_issue_links")
            .update({ backlink_comment_id: commentId })
            .eq("id", link.id);
        } catch (e) {
          console.error(`[feedback] ${provider.id} backlink`, e);
        }
      });
    }
    return json(created ? 201 : 200, { link });
  };

  const routes: ModRouteTable = {
    [`GET ${p("/status")}`]: providerHandle(async (req, ctx) => {
      const pctx = await providerContext(opts, ctx, req);
      const status = await provider.status(pctx);
      const { data: row } = await ctx.supabase
        .from("mod_feedback_integrations")
        .select("enabled, last_synced_at, last_error")
        .eq("provider", provider.id)
        .maybeSingle();
      return ok({
        provider: provider.id,
        label: provider.label,
        ...status,
        enabled: pctx.settings.enabled && (row?.enabled ?? true),
        lastSyncedAt: row?.last_synced_at ?? null,
        lastError: row?.last_error ?? null,
      });
    }),

    [`GET ${p("/search")}`]: providerHandle(async (req, ctx) => {
      const q = (new URL(req.url).searchParams.get("q") ?? "")
        .trim()
        .slice(0, 200);
      if (!q) return ok({ issues: [] });
      const issues = await provider.search(
        await providerContext(opts, ctx, req),
        q,
      );
      return ok({ issues });
    }),

    [`POST ${p("/link")}`]: providerHandle(async (req, ctx) => {
      const input = await parseBody(
        req,
        z.object({
          ideaId: z.uuid(),
          externalId: z.string().trim().min(1).max(100),
        }),
      );
      return linkIssue(
        req,
        ctx,
        input.ideaId,
        input.externalId.replace(/^#/, ""),
        false,
      );
    }),

    [`POST ${p("/create")}`]: providerHandle(async (req, ctx) => {
      const input = await parseBody(req, z.object({ ideaId: z.uuid() }));
      const pctx = await providerContext(opts, ctx, req);
      const draft = await issueBody(input.ideaId, pctx.siteUrl, ctx);
      const issue = await provider.create(pctx, {
        title: draft.title,
        body: draft.body,
        labels: pctx.settings.newIssueLabels,
      });
      return linkIssue(req, ctx, input.ideaId, issue.externalId, true);
    }),

    [`POST ${p("/unlink")}`]: providerHandle(async (req, ctx) => {
      const input = await parseBody(req, z.object({ ideaId: z.uuid() }));
      must(
        await ctx.supabase
          .from("mod_feedback_issue_links")
          .delete()
          .eq("idea_id", input.ideaId)
          .eq("provider", provider.id),
      );
      return ok();
    }),

    /** "Sync now": push queued stage moves, then pull changed issues. */
    [`POST ${p("/sync")}`]: providerHandle(async (req, ctx) => {
      const pctx = await providerContext(opts, ctx, req);
      const pushed = await drainOutbox(pctx.db, provider, pctx);
      const pulled = await pollProvider(pctx.db, provider, pctx);
      return ok({ pushed, pulled });
    }),
  };

  const publicRoutes: ModPublicRouteTable = {
    [`GET ${p("/cron/sync")}`]: handle(
      async (req, ctx: ModPublicRouteContext) => {
        if (!isCronRequest(req)) return json(401, { error: "Unauthorized" });
        return ok(await runSync(opts, ctx, req));
      },
    ),
  };

  return { routes, publicRoutes };
}

/** One provider's sync pass (cron). Skips quietly when not connected/enabled. */
export async function runSync(
  opts: TrackerRouteOptions,
  ctx: Pick<ModPublicRouteContext, "host" | "getPayload">,
  req: Request,
) {
  const pctx = await providerContext(opts, ctx, req);
  if (!pctx.settings.enabled)
    return { provider: opts.provider.id, skipped: "disabled" };
  const status = await opts.provider.status(pctx);
  if (!status.connected)
    return {
      provider: opts.provider.id,
      skipped: status.reason ?? "not connected",
    };
  try {
    const pushed = await drainOutbox(pctx.db, opts.provider, pctx);
    const pulled = await pollProvider(pctx.db, opts.provider, pctx);
    return { provider: opts.provider.id, pushed, pulled };
  } catch (err) {
    await pctx.db
      .from("mod_feedback_integrations")
      .update({ last_error: (err as Error).message.slice(0, 500) })
      .eq("provider", opts.provider.id);
    return { provider: opts.provider.id, error: (err as Error).message };
  }
}

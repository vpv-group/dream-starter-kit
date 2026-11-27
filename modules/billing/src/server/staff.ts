import "server-only";

import { z } from "zod/v4";

import type { Json } from "@acme/api";
import type { ModRouteContext, ModRouteTable } from "@acme/mod-kit/server";

import type { AdminClient, BillingSubject } from "./core/types";
import { createAdminClient } from "./admin-client";
import { grantPlan, revokeGrant } from "./core/grants";
import { getBillingProviders, invoicesFor } from "./core/providers";
import { billingTagSettings } from "./core/settings";
import { syncSubjectTags } from "./core/tags";

/**
 * Staff billing support (/api/mod/billing/admin/*): find any account or
 * workspace, see its billing READ-ONLY (plan, purchases, invoices, provider
 * customer), and grant / extend / revoke no-charge plans. Staff only
 * (`profiles.is_staff`); reads go through the service role because staff
 * aren't members of the accounts they support. Every view and change is
 * written to the audit log. Paid subscriptions are never changed here —
 * they're managed in the provider (a dashboard link is returned).
 */

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status });

async function isStaff(ctx: ModRouteContext): Promise<boolean> {
  if (ctx.user.is_anonymous) return false;
  const { data } = await ctx.supabase
    .from("profiles")
    .select("is_staff")
    .eq("id", ctx.user.id)
    .maybeSingle();
  return data?.is_staff === true;
}

function staffOnly(
  handler: (
    req: Request,
    ctx: ModRouteContext,
    admin: AdminClient,
  ) => Promise<Response>,
) {
  return async (req: Request, ctx: ModRouteContext) => {
    if (!(await isStaff(ctx))) return json(403, { error: "Staff only" });
    return handler(req, ctx, createAdminClient());
  };
}

async function audit(
  admin: AdminClient,
  ctx: ModRouteContext,
  action: string,
  subject: BillingSubject,
  meta: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await admin.rpc("audit_log_event", {
    _action: action,
    _actor_id: ctx.user.id,
    _actor_type: "user",
    _entity_type: subject.orgId !== undefined ? "organization" : "user",
    _entity_id: subject.orgId ?? subject.userId,
    ...(subject.orgId !== undefined ? { _org_id: subject.orgId } : {}),
    _meta: meta as Json,
  });
  if (error) console.warn(`[billing] audit ${action} failed`, error.message);
}

const subjectSchema = z.union([
  z.object({ userId: z.uuid() }),
  z.object({ orgId: z.uuid() }),
]);

function subjectFromQuery(url: URL): BillingSubject | null {
  const parsed = subjectSchema.safeParse(
    url.searchParams.get("org")
      ? { orgId: url.searchParams.get("org") }
      : { userId: url.searchParams.get("user") },
  );
  return parsed.success ? parsed.data : null;
}

/** PostgREST ilike pattern: escape the wildcards a search term may contain. */
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const grantSchema = z.object({
  subject: subjectSchema,
  planId: z.union([z.string(), z.number()]),
  /** ISO date-time it ends; omitted/null = until revoked. */
  expiresAt: z.iso.datetime({ offset: true }).nullish(),
  note: z.string().max(500).nullish(),
  /** Change an existing grant (extend it) instead of adding one. */
  grantId: z.string().startsWith("manual:").optional(),
});

export const staffRoutes: ModRouteTable = {
  /**
   * Installed payment providers and whether each is set up — billing's
   * panel on Modules → Billing warns when buyers can't pay.
   */
  "GET /admin/providers": staffOnly(async () => {
    const providers = await getBillingProviders();
    return Response.json({
      providers: await Promise.all(
        providers.map(async (p) => ({
          id: p.id,
          label: p.label,
          platforms: p.platforms,
          configured: await p.isConfigured().catch(() => false),
        })),
      ),
    });
  }),

  /** Find people (email / name) and workspaces (name / slug). */
  "GET /admin/search": staffOnly(async (req, _ctx, admin) => {
    const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
    if (q.length < 2) return Response.json({ results: [] });
    const [byEmail, byName, orgsByName, orgsBySlug] = await Promise.all([
      admin
        .from("profiles")
        .select("id, email, display_name")
        .ilike("email", like(q))
        .limit(8),
      admin
        .from("profiles")
        .select("id, email, display_name")
        .ilike("display_name", like(q))
        .limit(8),
      admin
        .from("organizations")
        .select("id, name, slug")
        .ilike("name", like(q))
        .limit(8),
      admin
        .from("organizations")
        .select("id, name, slug")
        .ilike("slug", like(q))
        .limit(8),
    ]);
    const people = new Map<
      string,
      { id: string; email: string | null; display_name: string | null }
    >();
    for (const p of [...(byEmail.data ?? []), ...(byName.data ?? [])]) {
      people.set(p.id, p);
    }
    const orgs = new Map<
      string,
      { id: string; name: string; slug: string | null }
    >();
    for (const o of [...(orgsByName.data ?? []), ...(orgsBySlug.data ?? [])]) {
      orgs.set(o.id, o);
    }
    return Response.json({
      results: [
        ...[...orgs.values()].map((o) => ({
          kind: "org" as const,
          id: o.id,
          label: o.name,
          detail: o.slug ? `/${o.slug}` : "Workspace",
        })),
        ...[...people.values()].map((p) => ({
          kind: "user" as const,
          id: p.id,
          label: p.display_name ?? p.email ?? p.id,
          detail: p.email ?? "",
        })),
      ].slice(0, 12),
    });
  }),

  /** Everything the support view shows for one account or workspace. */
  "GET /admin/account": staffOnly(async (req, ctx, admin) => {
    const subject = subjectFromQuery(new URL(req.url));
    if (!subject) return json(400, { error: "Pass ?user=<id> or ?org=<id>" });

    let header: Record<string, unknown>;
    let workspaces: { id: string; name: string; role: string }[] = [];
    if (subject.orgId !== undefined) {
      const { data: org } = await admin
        .from("organizations")
        .select("id, name, slug, owner_id")
        .eq("id", subject.orgId)
        .maybeSingle();
      if (!org) return json(404, { error: "Workspace not found" });
      const [{ data: owner }, { count }] = await Promise.all([
        admin
          .from("profiles")
          .select("id, email, display_name")
          .eq("id", org.owner_id)
          .maybeSingle(),
        admin
          .from("memberships")
          .select("user_id", { count: "exact", head: true })
          .eq("org_id", org.id),
      ]);
      header = {
        kind: "org",
        id: org.id,
        name: org.name,
        slug: org.slug,
        owner: owner
          ? { id: owner.id, email: owner.email, name: owner.display_name }
          : null,
        members: count ?? 0,
      };
    } else {
      const { data: person } = await admin
        .from("profiles")
        .select("id, email, display_name")
        .eq("id", subject.userId)
        .maybeSingle();
      if (!person) return json(404, { error: "Account not found" });
      const { data: ms } = await admin
        .from("memberships")
        .select("role, organizations(id, name)")
        .eq("user_id", subject.userId);
      workspaces = (ms ?? []).flatMap((m) => {
        const o = m.organizations as { id: string; name: string } | null;
        return o ? [{ id: o.id, name: o.name, role: m.role }] : [];
      });
      header = {
        kind: "user",
        id: person.id,
        email: person.email,
        name: person.display_name,
      };
    }

    // Purchases (all statuses, newest first) with their plan names.
    const query = admin
      .from("mod_billing_subscriptions")
      .select(
        "id, provider, store, kind, status, entitlement, cancel_at_period_end, current_period_end, created_at, price_id, plan_id, note, granted_by",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    const { data: rows } =
      subject.orgId !== undefined
        ? await query.eq("org_id", subject.orgId)
        : await query.eq("user_id", subject.userId).is("org_id", null);
    const priceIds = [
      ...new Set((rows ?? []).flatMap((r) => (r.price_id ? [r.price_id] : []))),
    ];
    const names = new Map<string, string>();
    if (priceIds.length > 0) {
      const { data: prices } = await admin
        .from("mod_billing_prices")
        .select("id, product_id")
        .in("id", priceIds);
      const productIds = (prices ?? []).flatMap((p) =>
        p.product_id ? [p.product_id] : [],
      );
      const { data: products } =
        productIds.length > 0
          ? await admin
              .from("mod_billing_products")
              .select("id, name")
              .in("id", productIds)
          : { data: [] as { id: string; name: string | null }[] };
      const productName = new Map(
        (products ?? []).map((p) => [p.id, p.name ?? p.id]),
      );
      for (const p of prices ?? []) {
        if (p.product_id)
          names.set(p.id, productName.get(p.product_id) ?? p.id);
      }
    }
    const now = Date.now();
    const purchases = (rows ?? []).map((r) => {
      // A grant that ran out while still active reads "expired" (the daily
      // sweep then cancels it); a revoked one keeps its "canceled" status.
      const expiredGrant =
        r.provider === "manual" &&
        (r.status === "active" || r.status === "trialing") &&
        r.current_period_end !== null &&
        Date.parse(r.current_period_end) <= now;
      return {
        id: r.id,
        planName: r.price_id ? (names.get(r.price_id) ?? null) : null,
        provider: r.provider,
        store: r.store,
        kind: r.kind,
        status: expiredGrant ? "expired" : r.status,
        entitlement: r.entitlement,
        cancelAtPeriodEnd: r.cancel_at_period_end,
        currentPeriodEnd: r.current_period_end,
        createdAt: r.created_at,
        planId: r.plan_id,
        note: r.note,
        isGrant: r.provider === "manual",
      };
    });
    const active = purchases.filter(
      (p) => p.status === "active" || p.status === "trialing",
    );

    const providers = await getBillingProviders();
    const customers = (
      await Promise.all(
        providers.map(async (p) => {
          if (!p.customerLink) return null;
          try {
            const link = await p.customerLink({ subject });
            return link ? { provider: p.id, label: p.label, ...link } : null;
          } catch {
            return null;
          }
        }),
      )
    ).filter((c) => c !== null);

    await audit(admin, ctx, "billing.support_view", subject);
    return Response.json({
      subject: header,
      workspaces,
      isPremium: active.some((p) => p.entitlement === "premium"),
      purchases,
      invoices: await invoicesFor(subject),
      customers,
    });
  }),

  /** Grant (or extend) a no-charge plan. */
  "POST /admin/grant": staffOnly(async (req, ctx, admin) => {
    const parsed = grantSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json(400, { error: "Invalid grant" });
    const { planId, expiresAt, note, grantId } = parsed.data;
    const subject = parsed.data.subject as BillingSubject;
    if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
      return json(400, { error: "The end date must be in the future" });
    }
    const payload = await ctx.getPayload();
    const plan = await payload
      .findByID({ collection: "mod-billing-plans", id: planId, depth: 0 })
      .catch(() => null);
    if (!plan) return json(404, { error: "Plan not found" });
    try {
      const id = await grantPlan(admin, {
        subject,
        plan: { id: plan.id, name: plan.name, entitlement: plan.entitlement },
        expiresAt: expiresAt ?? null,
        note: note ?? null,
        grantedBy: ctx.user.id,
        ...(grantId ? { grantId } : {}),
      });
      await syncSubjectTags(
        admin,
        subject,
        await billingTagSettings(ctx.getPayload),
      );
      await audit(
        admin,
        ctx,
        grantId ? "billing.grant_changed" : "billing.grant_added",
        subject,
        {
          grantId: id,
          planId: String(plan.id),
          expiresAt: expiresAt ?? null,
          note: note ?? null,
        },
      );
      return Response.json({ ok: true, grantId: id });
    } catch (err) {
      return json(400, {
        error: err instanceof Error ? err.message : "Could not grant the plan",
      });
    }
  }),

  /** End a staff grant now. */
  "POST /admin/revoke": staffOnly(async (req, ctx, admin) => {
    const parsed = z
      .object({ grantId: z.string().startsWith("manual:") })
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json(400, { error: "Only staff grants can be revoked here" });
    }
    const row = await revokeGrant(admin, parsed.data.grantId);
    if (!row) return json(404, { error: "Grant not found" });
    const subject: BillingSubject = row.orgId
      ? { orgId: row.orgId }
      : { userId: row.userId };
    await syncSubjectTags(
      admin,
      subject,
      await billingTagSettings(ctx.getPayload),
    );
    await audit(admin, ctx, "billing.grant_revoked", subject, {
      grantId: parsed.data.grantId,
    });
    return Response.json({ ok: true });
  }),
};

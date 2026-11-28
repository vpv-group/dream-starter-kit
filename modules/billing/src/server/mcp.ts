import "server-only";

import type { Where } from "payload";
import { z } from "zod";

import type { Json } from "@acme/api";
import type { ModBillingCoupon, ModBillingPlan } from "@acme/cms";
import type {
  ModMcpContext,
  ModMcpExtension,
  ModMcpTool,
} from "@acme/mod-kit/server";
import { defineMcpTool } from "@acme/mod-kit/server";

/**
 * Billing's remote-MCP tools (manifest `server.mcp: true`): read, create,
 * edit, delete and re-sync the Commerce catalog — plans and coupons — from an
 * MCP client (Claude, ChatGPT, Cursor, …). See docs/MCP.md → Billing tools.
 *
 * Every call runs through the Payload Local API AS the calling staff user
 * (`overrideAccess: false`), so the collections' own access rules apply
 * exactly as in /admin: anyone staff can read, only admins can write. Saves
 * run billing's catalog hook, which pushes the change to each payment
 * provider (Stripe: new price/coupon when the amount changes); each write is
 * re-read afterwards so the result reports the provider sync outcome rather
 * than echoing the request.
 *
 * Inputs are typed and cross-checked here (cents, intervals, discount ranges,
 * one welcome offer, unique promotion codes) so a model gets a clear error
 * before Payload or the provider rejects a half-valid write.
 */

const PLANS = "mod-billing-plans" as const;
const COUPONS = "mod-billing-coupons" as const;
const SUBSCRIPTIONS = "mod-billing-subscriptions" as const;

type Plan = ModBillingPlan;
type Coupon = ModBillingCoupon;

/** Statuses that still count as a paying (or about-to-pay) subscriber. */
const LIVE_STATUSES = ["active", "trialing", "past_due"] as const;

/** Fields whose change makes a provider create a new price (prices are immutable). */
const PRICE_FIELDS = [
  "unitAmount",
  "currency",
  "pricingType",
  "interval",
  "intervalCount",
] as const;

/** Fields whose change makes a provider recreate the coupon + promotion code. */
const COUPON_TERMS = [
  "discountType",
  "value",
  "currency",
  "duration",
  "durationCount",
  "durationUnit",
] as const;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** A tool-level failure: thrown, it reaches the client as an `isError` result. */
class BillingToolError extends Error {}

const fail = (message: string): never => {
  throw new BillingToolError(message);
};

/** Local API options that act as the calling staff user (access enforced). */
function asCaller(ctx: ModMcpContext) {
  return {
    overrideAccess: false as const,
    // The /mcp route resolved this `cms.users` row (with `collection`).
    user: { collection: "users", ...ctx.cmsUser } as never,
  };
}

const idSchema = z
  .union([z.string().min(1), z.number().int()])
  .describe("The document id (see the list tools).");

/** Money in the smallest unit, formatted for people (999 usd → "$9.99"). */
export function formatAmount(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/** "$9.99 / month", "$99.00 every 3 months", "$199.00 once". */
export function describePrice(plan: Partial<Plan>): string {
  const amount = formatAmount(plan.unitAmount ?? 0, plan.currency ?? "usd");
  if (plan.pricingType === "one_time") return `${amount} once`;
  const unit = plan.interval ?? "month";
  const count = plan.intervalCount ?? 1;
  return count > 1
    ? `${amount} every ${count} ${unit}s`
    : `${amount} / ${unit}`;
}

/** "20% off", "$5.00 off", then "once" / "for 3 months" / "forever". */
export function describeDiscount(coupon: Partial<Coupon>): string {
  const off =
    coupon.discountType === "amount_off"
      ? `${formatAmount(coupon.value ?? 0, coupon.currency ?? "usd")} off`
      : `${coupon.value ?? 0}% off`;
  if (coupon.duration === "forever") return `${off} forever`;
  if (coupon.duration === "repeating") {
    const n = coupon.durationCount ?? 1;
    const unit = coupon.durationUnit ?? "month";
    return `${off} for ${n} ${unit}${n === 1 ? "" : "s"}`;
  }
  return `${off} once (first invoice)`;
}

/** Provider ids an adapter stored on the doc (e.g. stripePriceId), unnamed. */
function providerFields(doc: Record<string, unknown>): Record<string, unknown> {
  const core = new Set([
    ...Object.keys(planShape),
    ...Object.keys(couponShape),
    "id",
    "slug",
    "syncStatus",
    "syncError",
    "lastSyncedAt",
    "timesRedeemed",
    "createdAt",
    "updatedAt",
    "subscriptions",
    "coupons",
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (!core.has(key) && value !== null && value !== undefined)
      out[key] = value;
  }
  return out;
}

function syncOf(doc: {
  skipSync?: boolean | null;
  syncStatus?: string | null;
  syncError?: string | null;
  lastSyncedAt?: string | null;
}) {
  return {
    status: doc.skipSync ? "skipped" : (doc.syncStatus ?? "unsynced"),
    error: doc.syncError ?? null,
    lastSyncedAt: doc.lastSyncedAt ?? null,
  };
}

const UNSYNCED_HINT =
  "Still unsynced after a save usually means no payment provider is " +
  "connected yet (/admin → Modules → Billing); billing_resync pushes it " +
  "once one is.";

function planSummary(plan: Plan) {
  return {
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
    active: plan.active ?? true,
    price: describePrice(plan),
    pricingType: plan.pricingType,
    unitAmount: plan.unitAmount,
    currency: plan.currency,
    interval: plan.pricingType === "recurring" ? plan.interval : null,
    intervalCount: plan.pricingType === "recurring" ? plan.intervalCount : null,
    trialDays: plan.trialDays ?? null,
    introOffer: plan.introOffer?.enabled
      ? {
          introAmount: plan.introOffer.introAmount,
          introInterval: plan.introOffer.introInterval,
          introPeriods: plan.introOffer.introPeriods,
          text: `${formatAmount(plan.introOffer.introAmount ?? 0, plan.currency)} for the first ${plan.introOffer.introPeriods ?? 1} ${plan.introOffer.introInterval ?? "month"}(s)`,
        }
      : null,
    entitlement: plan.entitlement ?? "premium",
    badge: plan.badge ?? null,
    highlighted: plan.highlighted ?? false,
    displayOrder: plan.displayOrder ?? 0,
    sync: syncOf(plan),
  };
}

function planDetail(plan: Plan) {
  return {
    ...planSummary(plan),
    description: plan.description ?? null,
    features: (plan.features ?? []).map((f) => ({
      text: f.text,
      included: f.included ?? true,
    })),
    skipSync: plan.skipSync ?? false,
    provider: providerFields(plan as unknown as Record<string, unknown>),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

const relId = (v: unknown): string | number | null =>
  typeof v === "string" || typeof v === "number"
    ? v
    : v && typeof v === "object" && "id" in v
      ? (v as { id: string | number }).id
      : null;

function couponSummary(coupon: Coupon) {
  return {
    id: coupon.id,
    name: coupon.name,
    code: coupon.code ?? null,
    active: coupon.active ?? true,
    discount: describeDiscount(coupon),
    discountType: coupon.discountType,
    value: coupon.value,
    currency: coupon.discountType === "amount_off" ? coupon.currency : null,
    duration: coupon.duration,
    durationCount:
      coupon.duration === "repeating" ? (coupon.durationCount ?? 1) : null,
    durationUnit:
      coupon.duration === "repeating" ? (coupon.durationUnit ?? "month") : null,
    redeemBy: coupon.redeemBy ?? null,
    maxRedemptions: coupon.maxRedemptions ?? null,
    timesRedeemed: coupon.timesRedeemed ?? 0,
    appliesTo: (coupon.appliesTo ?? [])
      .map(relId)
      .filter((v): v is string | number => v !== null),
    isWelcomeOffer: coupon.isWelcomeOffer ?? false,
    sync: syncOf(coupon),
  };
}

function couponDetail(coupon: Coupon) {
  return {
    ...couponSummary(coupon),
    minimumAmount: coupon.minimumAmount ?? null,
    skipSync: coupon.skipSync ?? false,
    provider: providerFields(coupon as unknown as Record<string, unknown>),
    createdAt: coupon.createdAt,
    updatedAt: coupon.updatedAt,
  };
}

/** Escape-free `like` across a few text fields. */
function textWhere(fields: string[], query?: string): Where | undefined {
  const q = query?.trim();
  if (!q) return undefined;
  return { or: fields.map((f) => ({ [f]: { like: q } })) };
}

function and(...parts: (Where | undefined)[]): Where | undefined {
  const present = parts.filter((p): p is Where => Boolean(p));
  if (present.length === 0) return undefined;
  return present.length === 1 ? present[0] : { and: present };
}

async function readPlan(ctx: ModMcpContext, id: string | number) {
  const doc = await ctx.payload
    .findByID({
      collection: PLANS,
      id,
      depth: 0,
      joins: false,
      ...asCaller(ctx),
    })
    .catch(() => null);
  return doc ?? fail(`No plan with id ${id}. Use billing_list_plans.`);
}

async function readCoupon(ctx: ModMcpContext, id: string | number) {
  const doc = await ctx.payload
    .findByID({ collection: COUPONS, id, depth: 0, ...asCaller(ctx) })
    .catch(() => null);
  return doc ?? fail(`No coupon with id ${id}. Use billing_list_coupons.`);
}

async function subscriberCounts(ctx: ModMcpContext, planId: string | number) {
  const base: Where = { plan: { equals: planId } };
  // Sequential on purpose: the serverless pool is small.
  const total = await ctx.payload.count({
    collection: SUBSCRIPTIONS,
    where: base,
    ...asCaller(ctx),
  });
  const live = await ctx.payload.count({
    collection: SUBSCRIPTIONS,
    where: { and: [base, { status: { in: [...LIVE_STATUSES] } }] },
    ...asCaller(ctx),
  });
  return { live: live.totalDocs, total: total.totalDocs };
}

/** Best-effort audit trail for catalog changes made through the MCP. */
async function audit(
  ctx: ModMcpContext,
  action: string,
  entity: "billing_plan" | "billing_coupon",
  id: string | number,
  meta: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await ctx.admin.rpc("audit_log_event", {
      _action: action,
      _actor_id: ctx.userId,
      _actor_type: "user",
      _entity_type: entity,
      _entity_id: String(id),
      _meta: { via: "mcp", ...meta } as Json,
    });
    if (error) console.warn(`[billing] audit ${action} failed`, error.message);
  } catch (err) {
    console.warn(`[billing] audit ${action} failed`, err);
  }
}

const defined = <T extends Record<string, unknown>>(obj: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;

/* -------------------------------------------------------------------------- */
/* Input shapes                                                               */
/* -------------------------------------------------------------------------- */

const cents = (what: string) =>
  z
    .number()
    .int()
    .min(0)
    .describe(`${what}, in the smallest currency unit (999 = $9.99).`);

// No `.transform` (inputs must stay JSON-Schema-representable for MCP
// clients); values are lower-cased in `normalize*` instead.
const currency = z
  .string()
  .regex(/^[a-zA-Z]{3}$/, "A 3-letter ISO currency code, e.g. usd")
  .describe("ISO currency code, e.g. usd.");

const planShape = {
  name: z.string().trim().min(1).describe("Plan name shown on /pricing."),
  slug: z
    .string()
    .optional()
    .describe("URL slug; derived from the name when omitted."),
  description: z.string().nullable().optional(),
  active: z
    .boolean()
    .optional()
    .describe("Purchasable and shown on /pricing (default true)."),
  pricingType: z
    .enum(["recurring", "one_time"])
    .optional()
    .describe("recurring = subscription (default); one_time = lifetime."),
  unitAmount: cents("Price"),
  currency: currency.optional(),
  interval: z
    .enum(["day", "week", "month", "year"])
    .optional()
    .describe("Billing interval for recurring plans (default month)."),
  intervalCount: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Bill every N intervals, e.g. 3 + month = quarterly."),
  trialDays: z
    .number()
    .int()
    .min(0)
    .nullable()
    .optional()
    .describe("Free trial length for recurring plans (0/null = none)."),
  introOffer: z
    .object({
      enabled: z.boolean(),
      introAmount: cents("Intro-period price").optional(),
      introInterval: z.enum(["month", "year"]).optional(),
      introPeriods: z.number().int().min(1).optional(),
    })
    .optional()
    .describe(
      'Recurring only: e.g. "$1 for the first month, then the standard ' +
        'price" = { enabled: true, introAmount: 100, introInterval: "month", ' +
        "introPeriods: 1 }. Applied automatically at checkout.",
    ),
  entitlement: z
    .enum(["members", "premium"])
    .optional()
    .describe("Content access level the plan unlocks (default premium)."),
  features: z
    .array(
      z.object({
        text: z.string().trim().min(1),
        included: z.boolean().optional(),
      }),
    )
    .optional()
    .describe("Pricing-card bullets. On update this REPLACES the whole list."),
  badge: z
    .string()
    .nullable()
    .optional()
    .describe('Pricing-card badge, e.g. "Best value".'),
  highlighted: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  skipSync: z
    .boolean()
    .optional()
    .describe("Don't push this plan to the payment providers on save."),
};

const couponShape = {
  name: z.string().trim().min(1),
  active: z.boolean().optional(),
  discountType: z
    .enum(["percent_off", "amount_off"])
    .optional()
    .describe("percent_off (default) or amount_off."),
  value: z
    .number()
    .int()
    .min(1)
    .describe("Percent (1–100) for percent_off, or cents for amount_off."),
  currency: currency
    .optional()
    .describe("ISO currency for amount_off coupons (default usd)."),
  duration: z
    .enum(["once", "repeating", "forever"])
    .optional()
    .describe(
      "once = first invoice (default), repeating = durationCount × " +
        "durationUnit, forever.",
    ),
  durationCount: z.number().int().min(1).optional(),
  durationUnit: z.enum(["month", "year"]).optional(),
  maxRedemptions: z.number().int().min(1).nullable().optional(),
  redeemBy: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional()
    .describe("ISO date-time after which it can't be redeemed."),
  minimumAmount: cents("Minimum order amount").nullable().optional(),
  appliesTo: z
    .array(idSchema)
    .optional()
    .describe("Plan ids it's limited to; empty/omitted = every plan."),
  code: z
    .string()
    .trim()
    .regex(/^\S+$/, "Promotion codes can't contain spaces")
    .max(64)
    .nullable()
    .optional()
    .describe("Customer-facing promotion code, e.g. LAUNCH20."),
  isWelcomeOffer: z
    .boolean()
    .optional()
    .describe("Use as the signup welcome offer (at most one active)."),
  skipSync: z.boolean().optional(),
};

/* -------------------------------------------------------------------------- */
/* Cross-field rules                                                          */
/* -------------------------------------------------------------------------- */

type PlanInput = Partial<{
  [K in keyof typeof planShape]: z.infer<(typeof planShape)[K]>;
}>;
type CouponInput = Partial<{
  [K in keyof typeof couponShape]: z.infer<(typeof couponShape)[K]>;
}>;

/** Check a plan as it WILL be (existing doc + patch). Throws on a bad combo. */
export function checkPlan(next: PlanInput, patch: PlanInput): void {
  const oneTime = next.pricingType === "one_time";
  if (oneTime) {
    const recurringOnly: string[] = (
      ["interval", "intervalCount", "trialDays"] as const
    ).filter((k) => patch[k] !== undefined && patch[k] !== null);
    if (patch.introOffer?.enabled) recurringOnly.push("introOffer");
    if (recurringOnly.length > 0)
      fail(
        `${recurringOnly.join(", ")} only apply to recurring plans; this ` +
          `plan is one_time.`,
      );
  }
  const intro = next.introOffer;
  if (!oneTime && intro?.enabled) {
    // Existing docs can hold null here, whatever the input type says.
    if (typeof intro.introAmount !== "number")
      fail("introOffer.enabled needs introAmount (cents).");
    if ((intro.introAmount ?? 0) >= (next.unitAmount ?? 0))
      fail(
        "introOffer.introAmount must be lower than the plan's unitAmount " +
          "(it's a discount on the first period).",
      );
  }
}

/** Check a coupon as it WILL be (existing doc + patch). */
export function checkCoupon(next: CouponInput): void {
  const type = next.discountType ?? "percent_off";
  if (type === "percent_off" && (next.value ?? 0) > 100)
    fail("A percent_off value is a percentage: 1–100.");
  if (next.duration === "repeating" && typeof next.durationCount !== "number")
    fail("duration=repeating needs durationCount (and durationUnit).");
  if (next.redeemBy && Date.parse(next.redeemBy) <= Date.now())
    fail("redeemBy must be in the future.");
}

async function checkPlansExist(
  ctx: ModMcpContext,
  ids: (string | number)[],
): Promise<void> {
  if (ids.length === 0) return;
  const { docs } = await ctx.payload.find({
    collection: PLANS,
    where: { id: { in: ids } },
    depth: 0,
    limit: ids.length,
    pagination: false,
    joins: false,
    select: { name: true },
    ...asCaller(ctx),
  });
  const found = new Set(docs.map((d) => String(d.id)));
  const missing = ids.filter((id) => !found.has(String(id)));
  if (missing.length > 0)
    fail(`appliesTo: no plan with id ${missing.join(", ")}.`);
}

/** At most one active welcome offer; promotion codes unique among coupons. */
async function checkCouponConflicts(
  ctx: ModMcpContext,
  next: CouponInput,
  selfId?: string | number,
): Promise<void> {
  const notSelf: Where | undefined =
    selfId === undefined ? undefined : { id: { not_equals: selfId } };
  if (next.isWelcomeOffer && next.active !== false) {
    const { docs } = await ctx.payload.find({
      collection: COUPONS,
      where: and(notSelf, {
        isWelcomeOffer: { equals: true },
        active: { equals: true },
      }),
      depth: 0,
      limit: 5,
      ...asCaller(ctx),
    });
    if (docs.length > 0)
      fail(
        `Only one active welcome offer is allowed; "${docs[0]?.name}" ` +
          `(id ${docs[0]?.id}) already is. Unset isWelcomeOffer or ` +
          `deactivate it first.`,
      );
  }
  const code = next.code?.trim();
  if (code) {
    const { docs } = await ctx.payload.find({
      collection: COUPONS,
      where: and(notSelf, { code: { equals: code } }),
      depth: 0,
      limit: 1,
      ...asCaller(ctx),
    });
    if (docs.length > 0)
      fail(
        `Promotion code "${code}" is already used by coupon ` +
          `"${docs[0]?.name}" (id ${docs[0]?.id}).`,
      );
  }
}

/** Lower-case the currency and trim the code (the shapes can't transform). */
function normalizeCoupon(input: CouponInput): CouponInput {
  return {
    ...input,
    ...(input.currency ? { currency: input.currency.toLowerCase() } : {}),
    ...(typeof input.code === "string" ? { code: input.code.trim() } : {}),
  };
}

/** The plan fields Payload stores, from validated tool input. */
function planData(input: PlanInput): Record<string, unknown> {
  return defined({
    ...input,
    ...(input.currency ? { currency: input.currency.toLowerCase() } : {}),
    // Defaults the collection would also apply, made explicit so the
    // cross-field check and the saved doc agree.
    ...(input.introOffer
      ? {
          introOffer: {
            introInterval: "month",
            introPeriods: 1,
            ...defined(input.introOffer),
          },
        }
      : {}),
    ...(input.features
      ? {
          features: input.features.map((f) => ({
            text: f.text,
            included: f.included ?? true,
          })),
        }
      : {}),
  });
}

/* -------------------------------------------------------------------------- */
/* Plan tools                                                                 */
/* -------------------------------------------------------------------------- */

const listPlans = defineMcpTool({
  name: "billing_list_plans",
  title: "List billing plans",
  description:
    "List the plans in the Commerce catalog (what /pricing sells), ordered " +
    "by displayOrder, with a readable price, intro offer, entitlement and " +
    "payment-provider sync status. Amounts are in cents.",
  readOnly: true,
  inputSchema: {
    active: z
      .boolean()
      .optional()
      .describe("Only active (true) or inactive (false) plans."),
    pricingType: z.enum(["recurring", "one_time"]).optional(),
    query: z.string().optional().describe("Match name or slug."),
    limit: z.number().int().min(1).max(100).optional(),
    page: z.number().int().min(1).optional(),
  },
  run: async ({ active, pricingType, query, limit, page }, ctx) => {
    const res = await ctx.payload.find({
      collection: PLANS,
      where: and(
        active === undefined ? undefined : { active: { equals: active } },
        pricingType ? { pricingType: { equals: pricingType } } : undefined,
        textWhere(["name", "slug"], query),
      ),
      sort: "displayOrder",
      limit: limit ?? 50,
      page: page ?? 1,
      depth: 0,
      joins: false,
      ...asCaller(ctx),
    });
    return {
      total: res.totalDocs,
      page: res.page ?? 1,
      totalPages: res.totalPages,
      plans: res.docs.map(planSummary),
    };
  },
});

const getPlan = defineMcpTool({
  name: "billing_get_plan",
  title: "Get a billing plan",
  description:
    "Read one plan by id or slug: every field, feature bullets, the " +
    "provider ids an adapter stored (e.g. Stripe product/price), sync " +
    "status, the coupons limited to it and its subscriber counts.",
  readOnly: true,
  inputSchema: {
    id: idSchema.optional(),
    slug: z.string().optional(),
  },
  run: async ({ id, slug }, ctx) => {
    let plan: Plan;
    if (id !== undefined) plan = await readPlan(ctx, id);
    else if (slug) {
      const { docs } = await ctx.payload.find({
        collection: PLANS,
        where: { slug: { equals: slug } },
        depth: 0,
        limit: 1,
        joins: false,
        ...asCaller(ctx),
      });
      plan = docs[0] ?? fail(`No plan with slug "${slug}".`);
    } else return fail("Pass id or slug.");

    const coupons = await ctx.payload.find({
      collection: COUPONS,
      where: { appliesTo: { in: [plan.id] } },
      depth: 0,
      limit: 50,
      ...asCaller(ctx),
    });
    return {
      plan: planDetail(plan),
      subscribers: await subscriberCounts(ctx, plan.id),
      couponsLimitedToPlan: coupons.docs.map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code ?? null,
        active: c.active ?? true,
        discount: describeDiscount(c),
      })),
    };
  },
});

const createPlan = defineMcpTool({
  name: "billing_create_plan",
  title: "Create a billing plan",
  description:
    "Create a plan (admins only). unitAmount is in cents (1900 = $19.00). " +
    "Recurring plans default to monthly; set pricingType one_time for a " +
    "lifetime purchase. On save it is pushed to the payment providers " +
    "(Stripe product + price); the result reports the sync outcome. Create " +
    "with active=false to stage a plan before it shows on /pricing.",
  inputSchema: planShape,
  run: async (raw, ctx) => {
    const input = defined(raw) as PlanInput;
    const next: PlanInput = {
      pricingType: "recurring",
      currency: "usd",
      ...input,
      ...(input.pricingType !== "one_time"
        ? { interval: input.interval ?? "month" }
        : {}),
    };
    checkPlan(next, input);
    const created = await ctx.payload.create({
      collection: PLANS,
      data: planData(next) as never,
      depth: 0,
      ...asCaller(ctx),
    });
    const plan = await readPlan(ctx, created.id);
    await audit(ctx, "billing.plan.create", "billing_plan", plan.id, {
      name: plan.name,
      price: describePrice(plan),
    });
    return {
      created: true,
      plan: planDetail(plan),
      ...(plan.syncStatus === "unsynced" && !plan.skipSync
        ? { note: UNSYNCED_HINT }
        : {}),
    };
  },
});

const updatePlan = defineMcpTool({
  name: "billing_update_plan",
  title: "Update a billing plan",
  description:
    "Change a plan (admins only); pass only the fields to change. Changing " +
    "the price (unitAmount, currency, pricingType, interval, intervalCount) " +
    "makes the provider create a NEW price and archive the old one — new " +
    "buyers pay the new price, existing subscribers keep theirs until it's " +
    "changed in the provider. active=false hides the plan from /pricing and " +
    "archives it in the provider (the safe alternative to deleting). " +
    "`features` replaces the whole list. Send null to clear description, " +
    "badge or trialDays.",
  inputSchema: {
    id: idSchema,
    ...Object.fromEntries(
      Object.entries(planShape).map(([k, v]) => [k, v.optional()]),
    ),
  } as { id: typeof idSchema } & {
    [K in keyof typeof planShape]: z.ZodOptional<(typeof planShape)[K]>;
  },
  run: async ({ id, ...patch }, ctx) => {
    const input = defined(patch) as PlanInput;
    if (Object.keys(input).length === 0)
      fail("Nothing to change — pass at least one field.");
    const current = await readPlan(ctx, id);
    const next = {
      ...(current as unknown as PlanInput),
      ...input,
      ...(input.introOffer
        ? {
            introOffer: {
              ...(current.introOffer ?? {}),
              ...input.introOffer,
            } as PlanInput["introOffer"],
          }
        : {}),
    } as PlanInput;
    checkPlan(next, input);
    await ctx.payload.update({
      collection: PLANS,
      id,
      data: planData({
        ...input,
        ...(input.introOffer ? { introOffer: next.introOffer } : {}),
      }),
      depth: 0,
      ...asCaller(ctx),
    });
    const plan = await readPlan(ctx, id);
    const priceChanged = PRICE_FIELDS.filter(
      (k) => k in input && current[k] !== plan[k],
    );
    await audit(ctx, "billing.plan.update", "billing_plan", plan.id, {
      fields: Object.keys(input),
      ...(priceChanged.length
        ? { from: describePrice(current), to: describePrice(plan) }
        : {}),
    });
    return {
      updated: true,
      plan: planDetail(plan),
      ...(priceChanged.length
        ? {
            note:
              `Price changed (${describePrice(current)} → ` +
              `${describePrice(plan)}): new buyers get the new price; ` +
              `existing subscribers stay on the old one until changed in ` +
              `the payment provider.`,
          }
        : {}),
      ...(plan.syncStatus === "unsynced" && !plan.skipSync
        ? { syncNote: UNSYNCED_HINT }
        : {}),
    };
  },
});

const deletePlan = defineMcpTool({
  name: "billing_delete_plan",
  title: "Delete a billing plan",
  description:
    "Permanently delete a plan (admins only). Refused while any " +
    "subscription or purchase references it — deactivate it instead " +
    "(billing_update_plan active=false), which hides it and archives it in " +
    "the provider while existing subscribers keep their access. Before " +
    "deleting, an active plan is deactivated so the provider archives its " +
    "product and price.",
  inputSchema: { id: idSchema },
  run: async ({ id }, ctx) => {
    const plan = await readPlan(ctx, id);
    const subs = await subscriberCounts(ctx, plan.id);
    if (subs.total > 0)
      fail(
        `"${plan.name}" has ${subs.total} subscription(s)/purchase(s) ` +
          `(${subs.live} live), so it can't be deleted. Deactivate it with ` +
          `billing_update_plan { id: ${JSON.stringify(plan.id)}, active: false }.`,
      );
    if (plan.active !== false) {
      await ctx.payload.update({
        collection: PLANS,
        id: plan.id,
        data: { active: false },
        depth: 0,
        ...asCaller(ctx),
      });
    }
    await ctx.payload.delete({
      collection: PLANS,
      id: plan.id,
      depth: 0,
      ...asCaller(ctx),
    });
    await audit(ctx, "billing.plan.delete", "billing_plan", plan.id, {
      name: plan.name,
      price: describePrice(plan),
    });
    return { deleted: true, id: plan.id, name: plan.name };
  },
});

/* -------------------------------------------------------------------------- */
/* Coupon tools                                                               */
/* -------------------------------------------------------------------------- */

const listCoupons = defineMcpTool({
  name: "billing_list_coupons",
  title: "List billing coupons",
  description:
    "List discount coupons with a readable discount, promotion code, " +
    "limits, redemptions, the plans they're limited to (empty = all) and " +
    "provider sync status.",
  readOnly: true,
  inputSchema: {
    active: z.boolean().optional(),
    planId: idSchema.optional().describe("Only coupons limited to this plan."),
    query: z.string().optional().describe("Match name or promotion code."),
    limit: z.number().int().min(1).max(100).optional(),
    page: z.number().int().min(1).optional(),
  },
  run: async ({ active, planId, query, limit, page }, ctx) => {
    const res = await ctx.payload.find({
      collection: COUPONS,
      where: and(
        active === undefined ? undefined : { active: { equals: active } },
        planId === undefined ? undefined : { appliesTo: { in: [planId] } },
        textWhere(["name", "code"], query),
      ),
      sort: "-createdAt",
      limit: limit ?? 50,
      page: page ?? 1,
      depth: 0,
      ...asCaller(ctx),
    });
    return {
      total: res.totalDocs,
      page: res.page ?? 1,
      totalPages: res.totalPages,
      coupons: res.docs.map(couponSummary),
    };
  },
});

const getCoupon = defineMcpTool({
  name: "billing_get_coupon",
  title: "Get a billing coupon",
  description:
    "Read one coupon by id or promotion code: every field, provider ids " +
    "(e.g. Stripe coupon / promotion code) and sync status.",
  readOnly: true,
  inputSchema: { id: idSchema.optional(), code: z.string().optional() },
  run: async ({ id, code }, ctx) => {
    if (id !== undefined)
      return { coupon: couponDetail(await readCoupon(ctx, id)) };
    if (!code) return fail("Pass id or code.");
    const { docs } = await ctx.payload.find({
      collection: COUPONS,
      where: { code: { equals: code.trim() } },
      depth: 0,
      limit: 1,
      ...asCaller(ctx),
    });
    return {
      coupon: couponDetail(
        docs[0] ?? fail(`No coupon with promotion code "${code}".`),
      ),
    };
  },
});

const createCoupon = defineMcpTool({
  name: "billing_create_coupon",
  title: "Create a billing coupon",
  description:
    "Create a discount coupon (admins only), optionally with a " +
    "customer-facing promotion `code`. percent_off takes 1–100; amount_off " +
    "takes cents. duration: once (first invoice), repeating (durationCount " +
    "× durationUnit) or forever. Pushed to the payment providers on save " +
    "(Stripe coupon + promotion code); the result reports the sync outcome.",
  inputSchema: couponShape,
  run: async (raw, ctx) => {
    const input = normalizeCoupon(defined(raw));
    const next: CouponInput = {
      discountType: "percent_off",
      duration: "once",
      ...input,
      ...(input.duration === "repeating"
        ? {
            durationCount: input.durationCount ?? 1,
            durationUnit: input.durationUnit ?? "month",
          }
        : {}),
      ...(input.discountType === "amount_off"
        ? { currency: input.currency ?? "usd" }
        : {}),
    };
    checkCoupon(next);
    await checkPlansExist(ctx, next.appliesTo ?? []);
    await checkCouponConflicts(ctx, next);
    const created = await ctx.payload.create({
      collection: COUPONS,
      data: defined(next) as never,
      depth: 0,
      ...asCaller(ctx),
    });
    const coupon = await readCoupon(ctx, created.id);
    await audit(ctx, "billing.coupon.create", "billing_coupon", coupon.id, {
      name: coupon.name,
      code: coupon.code ?? null,
      discount: describeDiscount(coupon),
    });
    return {
      created: true,
      coupon: couponDetail(coupon),
      ...(coupon.syncStatus === "unsynced" && !coupon.skipSync
        ? { note: UNSYNCED_HINT }
        : {}),
    };
  },
});

const updateCoupon = defineMcpTool({
  name: "billing_update_coupon",
  title: "Update a billing coupon",
  description:
    "Change a coupon (admins only); pass only the fields to change. " +
    "Changing its terms (discountType, value, currency, duration, " +
    "durationCount, durationUnit) makes the provider replace the coupon " +
    "and mint a new promotion code — discounts already applied to " +
    "subscriptions are unaffected. `active: false` turns its promotion " +
    "code off at checkout (true turns it back on); changing or clearing " +
    "`code` retires the old code. `appliesTo` replaces the plan list " +
    "([] = all plans). Send null to clear code, redeemBy, maxRedemptions " +
    "or minimumAmount.",
  inputSchema: {
    id: idSchema,
    ...Object.fromEntries(
      Object.entries(couponShape).map(([k, v]) => [k, v.optional()]),
    ),
  } as { id: typeof idSchema } & {
    [K in keyof typeof couponShape]: z.ZodOptional<(typeof couponShape)[K]>;
  },
  run: async ({ id, ...patch }, ctx) => {
    const input = normalizeCoupon(defined(patch));
    if (Object.keys(input).length === 0)
      fail("Nothing to change — pass at least one field.");
    const current = await readCoupon(ctx, id);
    const next = {
      ...(current as unknown as CouponInput),
      ...input,
    } as CouponInput;
    if (next.duration === "repeating") {
      next.durationCount ??= 1;
      next.durationUnit ??= "month";
    }
    checkCoupon({
      ...next,
      // Only re-check an expiry that's being set now.
      redeemBy: input.redeemBy,
    });
    if (input.appliesTo) await checkPlansExist(ctx, input.appliesTo);
    // Re-check conflicts only for what's changing.
    await checkCouponConflicts(
      ctx,
      {
        isWelcomeOffer:
          "isWelcomeOffer" in input || "active" in input
            ? next.isWelcomeOffer
            : false,
        active: next.active,
        code: "code" in input ? input.code : null,
      },
      current.id,
    );
    await ctx.payload.update({
      collection: COUPONS,
      id,
      data: input as never,
      depth: 0,
      ...asCaller(ctx),
    });
    const coupon = await readCoupon(ctx, id);
    const termsChanged = COUPON_TERMS.filter(
      (k) => k in input && current[k] !== coupon[k],
    );
    await audit(ctx, "billing.coupon.update", "billing_coupon", coupon.id, {
      fields: Object.keys(input),
      ...(termsChanged.length
        ? { from: describeDiscount(current), to: describeDiscount(coupon) }
        : {}),
    });
    return {
      updated: true,
      coupon: couponDetail(coupon),
      ...(termsChanged.length
        ? {
            note:
              `Terms changed (${describeDiscount(current)} → ` +
              `${describeDiscount(coupon)}): on sync the payment provider ` +
              `gets a new coupon (and promotion code); discounts already ` +
              `applied are unaffected.`,
          }
        : {}),
      ...(coupon.syncStatus === "unsynced" && !coupon.skipSync
        ? { syncNote: UNSYNCED_HINT }
        : {}),
    };
  },
});

const deleteCoupon = defineMcpTool({
  name: "billing_delete_coupon",
  title: "Delete a billing coupon",
  description:
    "Permanently delete a coupon from the catalog (admins only). Prefer " +
    "billing_update_coupon active=false to retire one; delete is for " +
    "mistakes. The provider turns its promotion code off and deletes its " +
    "coupon; subscriptions that already got the discount keep it.",
  inputSchema: { id: idSchema },
  run: async ({ id }, ctx) => {
    const coupon = await readCoupon(ctx, id);
    await ctx.payload.delete({
      collection: COUPONS,
      id: coupon.id,
      depth: 0,
      ...asCaller(ctx),
    });
    await audit(ctx, "billing.coupon.delete", "billing_coupon", coupon.id, {
      name: coupon.name,
      code: coupon.code ?? null,
    });
    return { deleted: true, id: coupon.id, name: coupon.name };
  },
});

/* -------------------------------------------------------------------------- */
/* Provider sync                                                              */
/* -------------------------------------------------------------------------- */

const resync = defineMcpTool({
  name: "billing_resync",
  title: "Re-sync the catalog to payment providers",
  description:
    "Push plans/coupons to the payment providers again (admins only) — e.g. " +
    "after connecting Stripe, or to retry a sync error. With `id`, one " +
    "document; without, every one whose sync status isn't `synced` (up to " +
    "50). Docs with skipSync stay skipped. Returns each doc's sync status.",
  inputSchema: {
    target: z.enum(["plans", "coupons"]),
    id: idSchema.optional(),
  },
  run: async ({ target, id }, ctx) => {
    const collection = target === "plans" ? PLANS : COUPONS;
    const pending: Where = {
      and: [
        { syncStatus: { not_equals: "synced" } },
        { skipSync: { not_equals: true } },
      ],
    };
    const findOpts = { where: pending, depth: 0, limit: 50, ...asCaller(ctx) };
    const docs: { id: string | number; name: string }[] =
      id !== undefined
        ? [
            target === "plans"
              ? await readPlan(ctx, id)
              : await readCoupon(ctx, id),
          ]
        : target === "plans"
          ? (
              await ctx.payload.find({
                collection: PLANS,
                joins: false,
                ...findOpts,
              })
            ).docs
          : (await ctx.payload.find({ collection: COUPONS, ...findOpts })).docs;

    const results = [];
    for (const doc of docs) {
      // A save with unchanged data re-runs the catalog hook (each provider's
      // sync is idempotent: it reuses the live price/coupon when it matches).
      await ctx.payload.update({
        collection,
        id: doc.id,
        data: { name: doc.name },
        depth: 0,
        ...asCaller(ctx),
      } as never);
      const fresh =
        target === "plans"
          ? await readPlan(ctx, doc.id)
          : await readCoupon(ctx, doc.id);
      results.push({ id: fresh.id, name: fresh.name, sync: syncOf(fresh) });
    }
    const unsynced = results.some((r) => r.sync.status === "unsynced");
    return {
      target,
      resynced: results.length,
      results,
      ...(unsynced ? { note: UNSYNCED_HINT } : {}),
    };
  },
});

/* -------------------------------------------------------------------------- */

const tools: ModMcpTool[] = [
  listPlans,
  getPlan,
  createPlan,
  updatePlan,
  deletePlan,
  listCoupons,
  getCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  resync,
];

export const mcp: ModMcpExtension = {
  instructions:
    "Billing tools (billing_*) manage the Commerce catalog: plans and " +
    "coupons (amounts in cents; saves sync to the payment provider). Use " +
    "them instead of the generic content tools for plans and coupons; only " +
    "admins can write.",
  tools,
};

export { BillingToolError };

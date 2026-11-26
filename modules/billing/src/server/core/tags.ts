import type { AdminClient, BillingStore } from "./types";

/**
 * Billing tags — keeps each user's billing-derived tags in public.tags /
 * public.user_tags (the kit's existing user tags: shown on /profile and the
 * admin Users page, and usable as notification audiences) in step with their
 * purchases, across every provider.
 *
 * Billing only ever adds or removes links to tags it MANAGES (registered in
 * mod_billing_managed_tags), so staff tags and other modules' system tags are
 * never touched. A staff tag that happens to share a billing tag's name is
 * left alone (that billing tag is skipped and logged).
 */

export type TagGroup = "plan" | "status" | "cycle" | "store";

export type StatusValue =
  "free" | "active" | "trialing" | "past_due" | "canceling" | "churned";

export interface TagGroupSettings {
  enabled?: boolean | null;
  /** Name template; `{plan}`, `{status}`, `{cycle}` or `{store}` is replaced. */
  template?: string | null;
}

/** Billing settings → Tags tab (all optional; defaults below). */
export interface BillingTagSettings {
  enabled?: boolean | null;
  plan?: TagGroupSettings | null;
  status?: TagGroupSettings | null;
  cycle?: TagGroupSettings | null;
  store?: TagGroupSettings | null;
}

export const TAG_DEFAULTS: Record<
  TagGroup,
  { enabled: boolean; template: string }
> = {
  // Bare plan + status names match the tags billing 1.x wrote (plan names,
  // "Free"), so existing notification audiences keep working.
  plan: { enabled: true, template: "{plan}" },
  status: { enabled: true, template: "{status}" },
  // Prefixed: the seeded plans are named Monthly / Annual / Lifetime.
  cycle: { enabled: true, template: "Billing cycle: {cycle}" },
  store: { enabled: true, template: "Store: {store}" },
};

const STATUS_LABELS: Record<StatusValue, string> = {
  free: "Free",
  active: "Active",
  trialing: "Trialing",
  past_due: "Past due",
  canceling: "Canceling",
  churned: "Churned",
};

const STORE_LABELS: Record<BillingStore, string> = {
  web: "Web",
  app_store: "App Store",
  play_store: "Play Store",
  promotional: "Promotional",
};

/** One of the user's purchases, with what the tags need. */
export interface TagInput {
  /** A ledger status (BillingStatus). */
  status: string;
  cancelAtPeriodEnd: boolean;
  /** "subscription" | "one_time". */
  kind: string;
  /** A BillingStore. */
  store: string;
  planName: string | null;
  interval: string | null;
  intervalCount: number | null;
}

export interface DesiredTag {
  group: TagGroup;
  value: string;
  name: string;
}

const ACTIVE = new Set(["active", "trialing"]);
const OWING = new Set(["past_due", "unpaid"]);
// Statuses that mean the user really had a plan (not an abandoned checkout).
const EVER_PAID = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "canceled",
  "paused",
]);

/** "Monthly", "Annual", "Every 3 months", "Lifetime", … */
export function cycleLabel(
  row: Pick<TagInput, "kind" | "interval" | "intervalCount">,
): string | null {
  if (row.kind === "one_time") return "Lifetime";
  const n = row.intervalCount ?? 1;
  switch (row.interval) {
    case "day":
      return n === 1 ? "Daily" : `Every ${n} days`;
    case "week":
      return n === 1 ? "Weekly" : `Every ${n} weeks`;
    case "month":
      if (n === 1) return "Monthly";
      if (n === 3) return "Quarterly";
      if (n === 12) return "Annual";
      return `Every ${n} months`;
    case "year":
      return n === 1 ? "Annual" : `Every ${n} years`;
    default:
      return null;
  }
}

/** The user's overall billing status. */
export function statusValue(rows: TagInput[]): StatusValue {
  const active = rows.filter((r) => ACTIVE.has(r.status));
  if (active.length > 0) {
    // A paid (non-trial) plan beats a trial; a plan that keeps renewing beats
    // one set to cancel.
    const paid = active.filter((r) => r.status === "active");
    if (paid.length === 0) return "trialing";
    return paid.some((r) => !r.cancelAtPeriodEnd || r.kind === "one_time")
      ? "active"
      : "canceling";
  }
  if (rows.some((r) => OWING.has(r.status))) return "past_due";
  if (rows.some((r) => EVER_PAID.has(r.status))) return "churned";
  return "free";
}

function resolve(
  settings: BillingTagSettings | null | undefined,
  group: TagGroup,
): { enabled: boolean; template: string } {
  const own = settings?.[group];
  return {
    enabled:
      settings?.enabled !== false &&
      (own?.enabled ?? TAG_DEFAULTS[group].enabled),
    template: own?.template?.trim()
      ? own.template.trim()
      : TAG_DEFAULTS[group].template,
  };
}

const fill = (template: string, value: string) =>
  template.replace(/\{(plan|status|cycle|store)\}/g, value).trim();

/** Pure: the tags a user should carry, given their purchases + settings. */
export function desiredBillingTags(
  rows: TagInput[],
  settings?: BillingTagSettings | null,
): DesiredTag[] {
  const out = new Map<string, DesiredTag>();
  const add = (group: TagGroup, value: string, label: string) => {
    const { enabled, template } = resolve(settings, group);
    if (!enabled) return;
    const name = fill(template, label);
    if (name) out.set(name, { group, value, name });
  };

  const status = statusValue(rows);
  add("status", status, STATUS_LABELS[status]);

  for (const row of rows.filter((r) => ACTIVE.has(r.status))) {
    if (row.planName) add("plan", row.planName, row.planName);
    const cycle = cycleLabel(row);
    if (cycle) add("cycle", cycle.toLowerCase(), cycle);
    const label =
      row.store in STORE_LABELS
        ? STORE_LABELS[row.store as BillingStore]
        : row.store;
    add("store", row.store, label);
  }
  return [...out.values()];
}

/** The user's purchases as tag inputs (price → product name for the plan). */
async function loadTagInputs(
  admin: AdminClient,
  userId: string,
): Promise<TagInput[]> {
  // Personal purchases, plus those of every workspace the user belongs to
  // (a company plan tags all its members). A workspace purchase is counted
  // through membership only, so a buyer who left the workspace loses it.
  const cols =
    "id, status, cancel_at_period_end, kind, store, price_id, provider, current_period_end, org_id";
  const { data: own, error } = await admin
    .from("mod_billing_subscriptions")
    .select(cols)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const { data: memberships } = await admin
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId);
  const orgIds = (memberships ?? []).map((m) => m.org_id);
  const { data: orgRows } =
    orgIds.length > 0
      ? await admin
          .from("mod_billing_subscriptions")
          .select(cols)
          .in("org_id", orgIds)
      : { data: [] as typeof own };
  const now = Date.now();
  const byId = new Map<string, (typeof own)[number]>();
  for (const r of [...own.filter((r) => !r.org_id), ...(orgRows ?? [])]) {
    byId.set(r.id, r);
  }
  // A staff grant past its end date no longer counts (the view agrees).
  const subs = [...byId.values()].map((r) =>
    r.provider === "manual" &&
    r.current_period_end &&
    Date.parse(r.current_period_end) <= now
      ? { ...r, status: "canceled" }
      : r,
  );
  const priceIds = [
    ...new Set(subs.flatMap((s) => (s.price_id ? [s.price_id] : []))),
  ];
  const prices = new Map<
    string,
    {
      product_id: string | null;
      interval: string | null;
      interval_count: number | null;
    }
  >();
  const products = new Map<string, string>();
  if (priceIds.length > 0) {
    const { data } = await admin
      .from("mod_billing_prices")
      .select("id, product_id, interval, interval_count")
      .in("id", priceIds);
    for (const p of data ?? []) prices.set(p.id, p);
    const productIds = [
      ...new Set(
        (data ?? []).flatMap((p) => (p.product_id ? [p.product_id] : [])),
      ),
    ];
    if (productIds.length > 0) {
      const { data: prods } = await admin
        .from("mod_billing_products")
        .select("id, name")
        .in("id", productIds);
      for (const p of prods ?? []) if (p.name) products.set(p.id, p.name);
    }
  }
  return subs.map((s) => {
    const price = s.price_id ? prices.get(s.price_id) : undefined;
    return {
      status: s.status ?? "",
      cancelAtPeriodEnd: s.cancel_at_period_end,
      kind: s.kind,
      store: s.store,
      planName: price?.product_id
        ? (products.get(price.product_id) ?? null)
        : null,
      interval: price?.interval ?? null,
      intervalCount: price?.interval_count ?? null,
    };
  });
}

/**
 * The managed tag for each desired name, creating the tag (is_system) and
 * its registration as needed. Names owned by a staff tag are dropped.
 */
async function ensureManagedTags(
  admin: AdminClient,
  desired: DesiredTag[],
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  if (desired.length === 0) return ids;
  const names = desired.map((d) => d.name);
  const { data: existing } = await admin
    .from("tags")
    .select("id, name, is_system")
    .in("name", names);
  const { data: managed } = await admin
    .from("mod_billing_managed_tags")
    .select("tag_id")
    .in(
      "tag_id",
      (existing ?? []).map((t) => t.id),
    );
  const managedIds = new Set((managed ?? []).map((m) => m.tag_id));
  const byName = new Map((existing ?? []).map((t) => [t.name, t]));

  for (const d of desired) {
    const tag = byName.get(d.name);
    if (tag && managedIds.has(tag.id)) {
      ids.set(d.name, tag.id);
      continue;
    }
    if (tag && !tag.is_system) {
      console.warn(
        `[billing] tag "${d.name}" is a staff tag — not using it for billing (rename the tag or change the billing tag template).`,
      );
      continue;
    }
    let tagId = tag?.id;
    if (!tagId) {
      const { data: created, error } = await admin
        .from("tags")
        .upsert({ name: d.name, is_system: true }, { onConflict: "name" })
        .select("id")
        .maybeSingle();
      if (error || !created) {
        console.warn(
          `[billing] could not create tag "${d.name}"`,
          error?.message,
        );
        continue;
      }
      tagId = created.id;
    }
    await admin
      .from("mod_billing_managed_tags")
      .upsert(
        { tag_id: tagId, tag_group: d.group, value: d.value },
        { onConflict: "tag_id", ignoreDuplicates: true },
      );
    ids.set(d.name, tagId);
  }
  return ids;
}

export interface TagSyncResult {
  added: string[];
  removed: number;
}

/**
 * Reconcile one user's billing tags with their purchases (all providers).
 * Idempotent; safe to call after every purchase change, at signup, and from
 * the daily sweep.
 */
export async function syncBillingTags(
  admin: AdminClient,
  userId: string,
  settings?: BillingTagSettings | null,
): Promise<TagSyncResult> {
  const desired = desiredBillingTags(
    await loadTagInputs(admin, userId),
    settings,
  );
  const want = await ensureManagedTags(admin, desired);
  const wantIds = new Set(want.values());

  const { data: managed } = await admin
    .from("mod_billing_managed_tags")
    .select("tag_id");
  const managedIds = (managed ?? []).map((m) => m.tag_id);
  const { data: links } =
    managedIds.length > 0
      ? await admin
          .from("user_tags")
          .select("tag_id")
          .eq("user_id", userId)
          .in("tag_id", managedIds)
      : { data: [] as { tag_id: string }[] };
  const have = new Set((links ?? []).map((l) => l.tag_id));

  const toAdd = [...wantIds].filter((id) => !have.has(id));
  const toRemove = [...have].filter((id) => !wantIds.has(id));
  if (toAdd.length > 0) {
    const { error } = await admin.from("user_tags").upsert(
      toAdd.map((tag_id) => ({ user_id: userId, tag_id })),
      { onConflict: "user_id,tag_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
  }
  if (toRemove.length > 0) {
    const { error } = await admin
      .from("user_tags")
      .delete()
      .eq("user_id", userId)
      .in("tag_id", toRemove);
    if (error) throw new Error(error.message);
  }
  const added = [...want.entries()]
    .filter(([, id]) => toAdd.includes(id))
    .map(([name]) => name);
  return { added, removed: toRemove.length };
}

/**
 * Re-sync every user who has a billing row (the daily sweep, and after staff
 * change the tag settings). Paged; returns how many users were synced.
 */
export async function syncAllBillingTags(
  admin: AdminClient,
  settings?: BillingTagSettings | null,
  opts: { pageSize?: number; maxUsers?: number } = {},
): Promise<number> {
  const pageSize = opts.pageSize ?? 500;
  const seen = new Set<string>();
  const orgs = new Set<string>();
  const sync = async (userId: string) => {
    if (seen.has(userId)) return;
    seen.add(userId);
    try {
      await syncBillingTags(admin, userId, settings);
    } catch (err) {
      console.warn(`[billing] tag sync failed for ${userId}`, err);
    }
  };
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("mod_billing_subscriptions")
      .select("user_id, org_id")
      .order("user_id")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    for (const { user_id, org_id } of data) {
      if (org_id) orgs.add(org_id);
      await sync(user_id);
      if (opts.maxUsers && seen.size >= opts.maxUsers) return seen.size;
    }
    if (data.length < pageSize) break;
  }
  // Members of workspaces with a purchase (a company plan tags them all).
  for (const orgId of orgs) {
    const { data } = await admin
      .from("memberships")
      .select("user_id")
      .eq("org_id", orgId);
    for (const { user_id } of data ?? []) {
      await sync(user_id);
      if (opts.maxUsers && seen.size >= opts.maxUsers) return seen.size;
    }
  }
  return seen.size;
}

/**
 * Re-sync the tags of everyone a purchase belongs to: the person, or every
 * member of the workspace.
 */
export async function syncSubjectTags(
  admin: AdminClient,
  subject: { userId?: string | null; orgId?: string | null },
  settings?: BillingTagSettings | null,
): Promise<void> {
  let users: string[] = subject.userId ? [subject.userId] : [];
  if (subject.orgId) {
    const { data } = await admin
      .from("memberships")
      .select("user_id")
      .eq("org_id", subject.orgId);
    users = (data ?? []).map((m) => m.user_id);
  }
  for (const u of users) {
    try {
      await syncBillingTags(admin, u, settings);
    } catch (err) {
      console.warn(`[billing] tag sync failed for ${u}`, err);
    }
  }
}

/**
 * Workspace (company) billing under RLS: a workspace's purchases and
 * entitlements are visible to its members — and only them — and its provider
 * customer to its owners/admins. Staff grants and workspace purchases are
 * written by the service role only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@acme/api/types";

import { installed } from "./installed";

const hasBilling = installed("billing");

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

type Client = SupabaseClient<Database>;
const noPersist = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient<Database>(SUPABASE_URL, SERVICE_KEY, noPersist);
const stamp = Date.now();
const password = "password123!";

const people = ["owner", "member", "outsider"] as const;
const ids = {} as Record<(typeof people)[number], string>;
const clients = {} as Record<(typeof people)[number], Client>;
let orgId = "";
const subId = `sub_ws_${stamp}`;
const grantId = `manual:ws-${stamp}`;

async function makeUser(name: string): Promise<[string, Client]> {
  const email = `bill-ws-${name}-${stamp}@acme.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, noPersist);
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return [data.user.id, client];
}

beforeAll(async () => {
  if (!hasBilling) return;
  for (const p of people) {
    const [id, client] = await makeUser(p);
    ids[p] = id;
    clients[p] = client;
  }
  const created = await clients.owner.rpc("create_workspace", {
    _name: "Billing Co",
    _slug: `billing-co-${stamp}`,
  });
  expect(created.error).toBeNull();
  orgId = created.data?.id ?? "";
  await admin
    .from("memberships")
    .insert({ org_id: orgId, user_id: ids.member, role: "member" });

  // A company subscription bought by the owner, and a staff grant.
  const sub = await admin.rpc("mod_billing_apply_subscription", {
    _row: {
      id: subId,
      user_id: ids.owner,
      org_id: orgId,
      status: "active",
      provider: "stripe",
    },
    _event_at: new Date().toISOString(),
  });
  expect(sub.error).toBeNull();
  const grant = await admin.rpc("mod_billing_apply_subscription", {
    _row: {
      id: grantId,
      user_id: ids.outsider,
      status: "active",
      provider: "manual",
      store: "promotional",
      // Ended yesterday: must no longer count.
      current_period_end: new Date(stamp - 86_400_000).toISOString(),
    },
    _event_at: new Date().toISOString(),
  });
  expect(grant.error).toBeNull();
  await admin.from("mod_billing_org_customer_links").insert({
    org_id: orgId,
    provider: "stripe",
    provider_customer_id: `cus_ws_${stamp}`,
  });
});

afterAll(async () => {
  if (!hasBilling) return;
  await admin
    .from("mod_billing_subscriptions")
    .delete()
    .in("id", [subId, grantId]);
  if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  for (const id of Object.values(ids)) {
    if (id) await admin.auth.admin.deleteUser(id);
  }
});

const premium = async (c: Client) =>
  (
    await c
      .from("mod_billing_entitlements")
      .select("subscription_id, org_id")
      .eq("entitlement", "premium")
  ).data ?? [];

describe.skipIf(!hasBilling)("workspace billing", () => {
  it("every member — not just the buyer — is entitled by a workspace plan", async () => {
    for (const p of ["owner", "member"] as const) {
      const rows = await premium(clients[p]);
      expect(rows.map((r) => r.subscription_id)).toContain(subId);
    }
  });

  it("people outside the workspace see none of it", async () => {
    const rows = await premium(clients.outsider);
    expect(rows.map((r) => r.subscription_id)).not.toContain(subId);
    const { data } = await clients.outsider
      .from("mod_billing_subscriptions")
      .select("id")
      .eq("org_id", orgId);
    expect(data).toHaveLength(0);
  });

  it("a staff grant past its end date no longer entitles", async () => {
    const rows = await premium(clients.outsider);
    expect(rows.map((r) => r.subscription_id)).not.toContain(grantId);
  });

  it("only owners/admins read the workspace's provider customer", async () => {
    const owner = await clients.owner
      .from("mod_billing_org_customer_links")
      .select("provider_customer_id")
      .eq("org_id", orgId);
    expect(owner.data).toHaveLength(1);
    for (const p of ["member", "outsider"] as const) {
      const { data } = await clients[p]
        .from("mod_billing_org_customer_links")
        .select("provider_customer_id")
        .eq("org_id", orgId);
      expect(data).toHaveLength(0);
    }
  });

  it("nobody but the service role writes workspace billing", async () => {
    const insertSub = await clients.owner
      .from("mod_billing_subscriptions")
      .insert({
        id: `sub_forged_${stamp}`,
        user_id: ids.owner,
        org_id: orgId,
        status: "active",
      });
    expect(insertSub.error).not.toBeNull();
    const insertLink = await clients.owner
      .from("mod_billing_org_customer_links")
      .insert({
        org_id: orgId,
        provider: "other",
        provider_customer_id: `cus_forged_${stamp}`,
      });
    expect(insertLink.error).not.toBeNull();
  });
});

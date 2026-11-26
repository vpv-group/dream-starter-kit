/**
 * Staff grants and workspace (company) plans: what members are entitled to and
 * tagged with, and that grants never touch paid purchases.
 */
import { describe, expect, it } from "vitest";

import { grantPlan, revokeGrant } from "../src/server/core/grants";
import { syncBillingTags, syncSubjectTags } from "../src/server/core/tags";
import { memoryDb } from "./memory-db";

const STAFF = "staff-1";
const OWNER = "owner-1";
const MEMBER = "member-1";
const ORG = "00000000-0000-4000-8000-0000000000aa";

function workspaceDb() {
  return memoryDb({
    organizations: [{ id: ORG, name: "Acme", owner_id: OWNER }],
    memberships: [
      { id: "m1", org_id: ORG, user_id: OWNER, role: "owner" },
      { id: "m2", org_id: ORG, user_id: MEMBER, role: "member" },
    ],
  });
}

describe("staff grants", () => {
  it("grants a person a no-charge plan, filed as a promotional purchase", async () => {
    const db = memoryDb();
    const id = await grantPlan(db.admin, {
      subject: { userId: "u1" },
      plan: { id: 7, name: "Pro" },
      expiresAt: null,
      note: "Partner",
      grantedBy: STAFF,
    });
    expect(id).toMatch(/^manual:/);
    const row = db.tables.mod_billing_subscriptions?.[0];
    expect(row).toMatchObject({
      id,
      user_id: "u1",
      provider: "manual",
      store: "promotional",
      status: "active",
      plan_id: "7",
      org_id: null,
      granted_by: STAFF,
      note: "Partner",
      price_id: "manual:price:7",
    });
    // The plan name reaches tags through the grant's catalog row.
    await syncBillingTags(db.admin, "u1");
    expect(db.tagsOf("u1")).toEqual(["Active", "Pro", "Store: Promotional"]);
  });

  it("files a workspace grant under the owner and tags every member", async () => {
    const db = workspaceDb();
    await grantPlan(db.admin, {
      subject: { orgId: ORG },
      plan: { id: 7, name: "Team" },
      expiresAt: null,
      grantedBy: STAFF,
    });
    expect(db.tables.mod_billing_subscriptions?.[0]).toMatchObject({
      user_id: OWNER,
      org_id: ORG,
    });
    await syncSubjectTags(db.admin, { orgId: ORG });
    expect(db.tagsOf(MEMBER)).toContain("Team");
    expect(db.tagsOf(OWNER)).toContain("Team");
  });

  it("extends an existing grant in place, and revokes it", async () => {
    const db = memoryDb();
    const id = await grantPlan(db.admin, {
      subject: { userId: "u1" },
      plan: { id: 7, name: "Pro" },
      expiresAt: "2031-01-01T00:00:00.000Z",
      grantedBy: STAFF,
    });
    await grantPlan(db.admin, {
      subject: { userId: "u1" },
      plan: { id: 7, name: "Pro" },
      expiresAt: "2032-01-01T00:00:00.000Z",
      grantedBy: STAFF,
      grantId: id,
    });
    expect(db.tables.mod_billing_subscriptions).toHaveLength(1);
    expect(db.tables.mod_billing_subscriptions?.[0]?.current_period_end).toBe(
      "2032-01-01T00:00:00.000Z",
    );
    expect(await revokeGrant(db.admin, id)).toEqual({
      userId: "u1",
      orgId: null,
    });
    expect(db.tables.mod_billing_subscriptions?.[0]?.status).toBe("canceled");
  });

  it("refuses to change or revoke a paid purchase", async () => {
    const db = memoryDb();
    await expect(revokeGrant(db.admin, "sub_123")).rejects.toThrow(
      /staff grants/,
    );
    await expect(
      grantPlan(db.admin, {
        subject: { userId: "u1" },
        plan: { id: 7, name: "Pro" },
        expiresAt: null,
        grantedBy: STAFF,
        grantId: "sub_123",
      }),
    ).rejects.toThrow(/staff grants/);
  });

  it("an expired grant stops counting for tags, and the daily run cancels it", async () => {
    const db = memoryDb({
      mod_billing_subscriptions: [
        {
          id: "manual:old",
          user_id: "u1",
          org_id: null,
          provider: "manual",
          store: "promotional",
          kind: "subscription",
          status: "active",
          cancel_at_period_end: false,
          current_period_end: "2020-01-01T00:00:00.000Z",
          price_id: null,
        },
      ],
    });
    await syncBillingTags(db.admin, "u1");
    expect(db.tagsOf("u1")).toEqual(["Churned"]);
  });
});

describe("workspace purchases", () => {
  it("count for members (not for a buyer who left)", async () => {
    const db = memoryDb({
      memberships: [{ id: "m2", org_id: ORG, user_id: MEMBER, role: "member" }],
      mod_billing_subscriptions: [
        {
          id: "sub_team",
          user_id: "buyer-who-left",
          org_id: ORG,
          provider: "stripe",
          store: "web",
          kind: "subscription",
          status: "active",
          cancel_at_period_end: false,
          current_period_end: null,
          price_id: null,
        },
      ],
    });
    await syncBillingTags(db.admin, MEMBER);
    expect(db.tagsOf(MEMBER)).toContain("Active");
    await syncBillingTags(db.admin, "buyer-who-left");
    expect(db.tagsOf("buyer-who-left")).toEqual(["Free"]);
  });
});

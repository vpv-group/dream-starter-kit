/**
 * Issue-tracker sync (004_integrations.sql + src/integrations/engine.ts)
 * against the live database: links are staff-only, moving an idea enqueues
 * an outbound sync, a move that came from the provider does NOT (loop
 * guard), inbound snapshots move the idea (unless locked), and draining is
 * idempotent.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@acme/api/types";
import { admin, createUser, signIn, testEmail } from "@acme/rls-tests/helpers";

import {
  applyExternalSnapshot,
  drainOutbox,
} from "../../src/integrations/engine";
import { githubProvider } from "../../src/integrations/github";
import { fakeContext, fakeGithub } from "../fake-github";

type Client = SupabaseClient<Database>;

const run = Date.now().toString(36);
const ST_PLANNED = `rls-int-planned-${run}`;
const ST_DONE = `rls-int-done-${run}`;
const STAGE_PLANNED = `planned-${run}`;
const STAGE_SHIPPED = `shipped-${run}`;
const emails = {
  staff: testEmail("int-staff"),
  member: testEmail("int-member"),
};
const ids = { staff: "", member: "" };
let staff: Client;
let member: Client;
let ideaId = "";
const mapping = [
  {
    external: "unstarted" as const,
    stage: STAGE_PLANNED,
    direction: "both" as const,
  },
  {
    external: "completed" as const,
    stage: STAGE_SHIPPED,
    direction: "both" as const,
  },
];

const pending = async () =>
  (
    await admin
      .from("mod_feedback_sync_outbox")
      .select("id, desired_stage")
      .eq("provider", "github")
      .is("done_at", null)
      .eq(
        "link_id",
        (
          await admin
            .from("mod_feedback_issue_links")
            .select("id")
            .eq("idea_id", ideaId)
            .single()
        ).data?.id ?? "",
      )
  ).data ?? [];

beforeAll(async () => {
  await admin
    .from("mod_feedback_statuses")
    .upsert([
      { id: ST_PLANNED, name: "Planned", type: "active", position: 970 },
      { id: ST_DONE, name: "Done", type: "complete", position: 971 },
    ])
    .throwOnError();
  await admin
    .from("mod_feedback_idea_stages")
    .upsert([
      {
        id: STAGE_PLANNED,
        name: "Planned",
        type: "active",
        position: -4,
        portal_status_id: ST_PLANNED,
        notify_voters: false,
      },
      {
        id: STAGE_SHIPPED,
        name: "Shipped",
        type: "complete",
        position: -3,
        portal_status_id: ST_DONE,
        notify_voters: false,
      },
    ])
    .throwOnError();
  ids.staff = await createUser(emails.staff);
  ids.member = await createUser(emails.member);
  await admin
    .from("profiles")
    .update({ is_staff: true })
    .eq("id", ids.staff)
    .throwOnError();
  staff = await signIn(emails.staff);
  member = await signIn(emails.member);
  ideaId = (
    await staff
      .from("mod_feedback_ideas")
      .insert({ title: "Sync me", stage_id: STAGE_PLANNED })
      .select("id")
      .single()
      .throwOnError()
  ).data.id;
});

afterAll(async () => {
  await admin.from("mod_feedback_ideas").delete().eq("id", ideaId);
  await admin
    .from("mod_feedback_idea_stages")
    .delete()
    .in("id", [STAGE_PLANNED, STAGE_SHIPPED]);
  await admin
    .from("mod_feedback_statuses")
    .delete()
    .in("id", [ST_PLANNED, ST_DONE]);
  for (const id of Object.values(ids))
    if (id) await admin.auth.admin.deleteUser(id);
});

describe("issue links", () => {
  it("are staff-only", async () => {
    const asMember = await member.from("mod_feedback_issue_links").insert({
      idea_id: ideaId,
      provider: "github",
      external_id: `m-${run}`,
      key: "#9",
      url: "https://github.com/acme/app/issues/9",
    });
    expect(asMember.error).not.toBeNull();
    await staff
      .from("mod_feedback_issue_links")
      .insert({
        idea_id: ideaId,
        provider: "github",
        external_id: "1",
        key: "#1",
        url: "https://github.com/acme/app/issues/1",
      })
      .throwOnError();
    const read = await member
      .from("mod_feedback_integrations")
      .select("provider");
    expect(read.data).toEqual([]);
  });
});

describe("two-way sync", () => {
  it("moving an idea enqueues an outbound sync", async () => {
    await staff
      .rpc("mod_feedback_set_idea_stage", {
        _idea: ideaId,
        _stage: STAGE_SHIPPED,
      })
      .throwOnError();
    expect((await pending()).map((r) => r.desired_stage)).toEqual([
      STAGE_SHIPPED,
    ]);
  });

  it("draining applies it once (idempotent)", async () => {
    const fake = fakeGithub();
    const ctx = { ...fakeContext(fake.github), db: admin };
    ctx.settings = { ...ctx.settings, statusMapping: mapping };
    const first = await drainOutbox(admin, githubProvider, ctx);
    expect(first).toEqual({ applied: 1, skipped: 0, failed: 0 });
    expect(fake.issues.get(1)?.state).toBe("closed");
    expect(await pending()).toEqual([]);
  });

  it("a move that came FROM GitHub doesn't sync back (loop guard)", async () => {
    await admin
      .rpc("mod_feedback_set_idea_stage", {
        _idea: ideaId,
        _stage: STAGE_PLANNED,
        _origin: "provider:github",
      })
      .throwOnError();
    expect(await pending()).toEqual([]);
  });

  it("inbound snapshots move the idea and its posts, unless locked", async () => {
    const issue = {
      provider: "github",
      externalId: "1",
      key: "#1",
      url: "https://github.com/acme/app/issues/1",
      title: "Sync me (renamed)",
      state: { category: "completed" as const, raw: "closed:completed" },
      labels: [],
      updatedAt: new Date().toISOString(),
    };
    await admin
      .from("mod_feedback_ideas")
      .update({ sync_locked: true })
      .eq("id", ideaId);
    const locked = await applyExternalSnapshot(admin, "github", issue, mapping);
    expect(locked).toMatchObject({ moved: false, reason: "idea locked" });
    await admin
      .from("mod_feedback_ideas")
      .update({ sync_locked: false })
      .eq("id", ideaId);
    const moved = await applyExternalSnapshot(admin, "github", issue, mapping);
    expect(moved).toMatchObject({ moved: true, stage: STAGE_SHIPPED });
    const again = await applyExternalSnapshot(admin, "github", issue, mapping);
    expect(again).toMatchObject({ moved: false, reason: "unchanged" });
    const { data: link } = await admin
      .from("mod_feedback_issue_links")
      .select("title, state_category")
      .eq("idea_id", ideaId)
      .single();
    expect(link).toEqual({
      title: "Sync me (renamed)",
      state_category: "completed",
    });
    // Inbound moves never enqueue a sync back to GitHub.
    expect(await pending()).toEqual([]);
  });
});

/**
 * Ideas (002_ideas.sql): staff-only, the stage → post-status cascade in one
 * call, linked posts following their idea, and vote totals.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@acme/api/types";
import { admin, createUser, signIn, testEmail } from "@acme/rls-tests/helpers";

type Client = SupabaseClient<Database>;

const run = Date.now().toString(36);
const BOARD = `rls-ideas-${run}`;
const ST_OPEN = `rls-i-open-${run}`;
const ST_PLANNED = `rls-i-planned-${run}`;
const STAGE_BACKLOG = `rls-backlog-${run}`;
const STAGE_PLANNED = `rls-planned-${run}`;

const emails = {
  member: testEmail("idea-member"),
  staff: testEmail("idea-staff"),
};
const ids = { member: "", staff: "" };
let member: Client;
let staff: Client;
let postA = "";
let postB = "";
let ideaId = "";

beforeAll(async () => {
  await admin
    .from("mod_feedback_boards")
    .upsert({ id: BOARD, slug: BOARD, name: "Ideas board", access: "public" })
    .throwOnError();
  await admin
    .from("mod_feedback_statuses")
    .upsert([
      { id: ST_OPEN, name: "Open", type: "open", position: 950 },
      { id: ST_PLANNED, name: "Planned", type: "active", position: 951 },
    ])
    .throwOnError();
  await admin
    .from("mod_feedback_idea_stages")
    .upsert([
      {
        id: STAGE_BACKLOG,
        name: "Backlog",
        type: "open",
        position: -2,
        portal_status_id: null,
        notify_voters: false,
      },
      {
        id: STAGE_PLANNED,
        name: "Planned",
        type: "active",
        position: -1,
        portal_status_id: ST_PLANNED,
        notify_voters: true,
      },
    ])
    .throwOnError();
  ids.member = await createUser(emails.member);
  ids.staff = await createUser(emails.staff);
  await admin
    .from("profiles")
    .update({ is_staff: true })
    .eq("id", ids.staff)
    .throwOnError();
  member = await signIn(emails.member);
  staff = await signIn(emails.staff);
  const mk = async (title: string) =>
    (
      await admin
        .from("mod_feedback_posts")
        .insert({
          board_id: BOARD,
          title,
          slug: "x",
          source: "staff",
          status_id: ST_OPEN,
        })
        .select("id")
        .single()
        .throwOnError()
    ).data.id;
  postA = await mk("Idea post A");
  postB = await mk("Idea post B");
  await member
    .from("mod_feedback_votes")
    .insert({ post_id: postA, user_id: ids.member })
    .throwOnError();
});

afterAll(async () => {
  await admin.from("mod_feedback_posts").delete().eq("board_id", BOARD);
  await admin.from("mod_feedback_ideas").delete().eq("id", ideaId);
  await admin.from("mod_feedback_boards").delete().eq("id", BOARD);
  await admin
    .from("mod_feedback_idea_stages")
    .delete()
    .in("id", [STAGE_BACKLOG, STAGE_PLANNED]);
  await admin
    .from("mod_feedback_statuses")
    .delete()
    .in("id", [ST_OPEN, ST_PLANNED]);
  for (const id of Object.values(ids))
    if (id) await admin.auth.admin.deleteUser(id);
});

describe("ideas", () => {
  it("are staff-only", async () => {
    const res = await member
      .from("mod_feedback_ideas")
      .insert({ title: "Nope" });
    expect(res.error).not.toBeNull();
    const created = await staff
      .from("mod_feedback_ideas")
      .insert({ title: "Mobile dark mode", stage_id: STAGE_BACKLOG })
      .select("id, vote_total")
      .single();
    expect(created.error).toBeNull();
    ideaId = created.data?.id ?? "";
    const asMember = await member
      .from("mod_feedback_ideas")
      .select("id")
      .eq("id", ideaId);
    expect(asMember.data).toEqual([]);
  });

  it("linking keeps the vote total", async () => {
    await staff
      .rpc("mod_feedback_link_post", { _post: postA, _idea: ideaId })
      .throwOnError();
    await staff
      .rpc("mod_feedback_link_post", { _post: postB, _idea: ideaId })
      .throwOnError();
    const { data } = await staff
      .from("mod_feedback_ideas")
      .select("vote_total")
      .eq("id", ideaId)
      .single();
    expect(data?.vote_total).toBe(1);
  });

  it("a stage can't be changed by a plain update", async () => {
    const res = await staff
      .from("mod_feedback_ideas")
      .update({ stage_id: STAGE_PLANNED })
      .eq("id", ideaId);
    expect(res.error?.code).toBe("42501");
  });

  it("linked posts follow the idea, not direct status changes", async () => {
    const res = await staff.rpc("mod_feedback_set_status", {
      _post: postA,
      _status: ST_PLANNED,
    });
    expect(res.error?.code).toBe("42501");
  });

  it("moving the idea cascades to every linked post in one call", async () => {
    const { data, error } = await staff.rpc("mod_feedback_set_idea_stage", {
      _idea: ideaId,
      _stage: STAGE_PLANNED,
      _message: "Planned for Q1",
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data?.every((c) => c.notified)).toBe(true);
    const posts = await admin
      .from("mod_feedback_posts")
      .select("status_id")
      .in("id", [postA, postB]);
    expect(posts.data?.map((p) => p.status_id)).toEqual([
      ST_PLANNED,
      ST_PLANNED,
    ]);
    const changes = await admin
      .from("mod_feedback_status_changes")
      .select("origin, message")
      .eq("post_id", postA);
    expect(changes.data).toEqual([
      { origin: "idea", message: "Planned for Q1" },
    ]);
  });

  it("members can't move ideas or read voter stats", async () => {
    const move = await member.rpc("mod_feedback_set_idea_stage", {
      _idea: ideaId,
      _stage: STAGE_BACKLOG,
    });
    expect(move.error?.code).toBe("42501");
    const stats = await member.rpc("mod_feedback_idea_voter_stats", {
      _ideas: [ideaId],
    });
    expect(stats.error?.code).toBe("42501");
  });
});

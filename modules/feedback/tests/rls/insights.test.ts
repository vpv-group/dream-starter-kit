/**
 * mod_feedback_insights (006_insights.sql): staff get period totals that
 * count only this period's activity; members and visitors are refused.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@acme/api/types";
import {
  admin,
  anonClient,
  createUser,
  signIn,
  testEmail,
} from "@acme/rls-tests/helpers";

import type { Insights } from "../../src/shared/insights";

type Client = SupabaseClient<Database>;

const run = Date.now().toString(36);
const BOARD = `rls-ins-${run}`;
const ST_OPEN = `rls-ins-open-${run}`;
const emails = {
  staff: testEmail("ins-staff"),
  member: testEmail("ins-member"),
};
const ids = { staff: "", member: "" };
let staff: Client;
let member: Client;

beforeAll(async () => {
  await admin
    .from("mod_feedback_boards")
    .upsert({ id: BOARD, slug: BOARD, name: "Insights", access: "public" })
    .throwOnError();
  await admin
    .from("mod_feedback_statuses")
    .upsert({ id: ST_OPEN, name: "Open", type: "open", position: 995 })
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
  const { data: posts } = await admin
    .from("mod_feedback_posts")
    .insert([
      {
        board_id: BOARD,
        title: "A",
        slug: "x",
        source: "staff",
        status_id: ST_OPEN,
      },
      {
        board_id: BOARD,
        title: "B",
        slug: "x",
        source: "api",
        status_id: ST_OPEN,
      },
    ])
    .select("id")
    .throwOnError();
  await admin
    .from("mod_feedback_votes")
    .insert({ post_id: posts[0]?.id ?? "", user_id: ids.member })
    .throwOnError();
});

afterAll(async () => {
  await admin.from("mod_feedback_posts").delete().eq("board_id", BOARD);
  await admin.from("mod_feedback_boards").delete().eq("id", BOARD);
  await admin.from("mod_feedback_statuses").delete().eq("id", ST_OPEN);
  await admin.auth.admin.deleteUser(ids.staff);
  await admin.auth.admin.deleteUser(ids.member);
});

const since = () => new Date(Date.now() - 7 * 86400_000).toISOString();

describe("mod_feedback_insights", () => {
  it("gives staff this period's totals for a board", async () => {
    const { data, error } = await staff.rpc("mod_feedback_insights", {
      _since: since(),
      _board: BOARD,
    });
    expect(error).toBeNull();
    const ins = data as unknown as Insights;
    expect(ins.unit).toBe("day");
    expect(ins.totals.posts).toEqual({ current: 2, previous: 0 });
    expect(ins.totals.votes.current).toBe(1);
    expect(ins.totals.voters.current).toBe(1);
    expect(ins.topPosts[0]?.title).toBe("A");
    expect(ins.bySource.map((s) => s.source).sort()).toEqual(["api", "staff"]);
    expect(ins.series.reduce((n, b) => n + b.posts, 0)).toBe(2);
    expect(ins.byStatus).toEqual([
      expect.objectContaining({ id: ST_OPEN, count: 2 }),
    ]);
  });

  it("refuses members and visitors", async () => {
    for (const client of [member, anonClient()]) {
      const { error } = await client.rpc("mod_feedback_insights", {
        _since: since(),
      });
      expect(error).not.toBeNull();
    }
    const { error } = await member.rpc("mod_feedback_changelog_reader_count", {
      _since: since(),
    });
    expect(error).not.toBeNull();
  });
});

/**
 * Feedback MCP tools (src/server/mcp.ts) against the live database: they
 * refuse callers who aren't feedback staff, attribute changes to the caller,
 * and move posts through the same RPCs as the staff workspace.
 */
import type { BasePayload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ModMcpContext, ModMcpTool } from "@acme/mod-kit/server";
import { admin, createUser, testEmail } from "@acme/rls-tests/helpers";

import { mcp } from "../../src/server/mcp";

const run = Date.now().toString(36);
const BOARD = `rls-mcp-${run}`;
const ST_OPEN = `rls-mcp-open-${run}`;
const ST_PLANNED = `rls-mcp-planned-${run}`;
const emails = {
  staff: testEmail("mcp-staff"),
  member: testEmail("mcp-member"),
};
const ids = { staff: "", member: "" };
let postId = "";

// getModuleSettings falls back to defaults when the CMS has no row.
const fakePayload = {
  find: () => Promise.resolve({ docs: [] }),
  findGlobal: () => Promise.resolve({}),
} as unknown as BasePayload;

const ctx = (userId: string): ModMcpContext => ({
  userId,
  cmsUser: { id: 1, roles: ["editor"] },
  payload: fakePayload,
  admin,
  origin: "https://app.test",
  host: {} as ModMcpContext["host"],
});

const tool = (name: string): ModMcpTool => {
  const t = mcp.tools?.find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t;
};

beforeAll(async () => {
  await admin
    .from("mod_feedback_boards")
    .upsert({ id: BOARD, slug: BOARD, name: "MCP board", access: "public" })
    .throwOnError();
  await admin
    .from("mod_feedback_statuses")
    .upsert([
      { id: ST_OPEN, name: `Open ${run}`, type: "open", position: 980 },
      { id: ST_PLANNED, name: `Planned ${run}`, type: "active", position: 981 },
    ])
    .throwOnError();
  ids.staff = await createUser(emails.staff);
  ids.member = await createUser(emails.member);
  await admin
    .from("profiles")
    .update({ is_staff: true })
    .eq("id", ids.staff)
    .throwOnError();
  const { data } = await admin
    .from("mod_feedback_posts")
    .insert({
      board_id: BOARD,
      title: `MCP findable ${run}`,
      slug: "x",
      source: "staff",
      status_id: ST_OPEN,
    })
    .select("id")
    .single()
    .throwOnError();
  postId = data.id;
});

afterAll(async () => {
  await admin.from("mod_feedback_posts").delete().eq("board_id", BOARD);
  await admin.from("mod_feedback_ideas").delete().like("title", `%${run}%`);
  await admin.from("mod_feedback_boards").delete().eq("id", BOARD);
  await admin
    .from("mod_feedback_statuses")
    .delete()
    .in("id", [ST_OPEN, ST_PLANNED]);
  await admin.auth.admin.deleteUser(ids.staff);
  await admin.auth.admin.deleteUser(ids.member);
});

describe("feedback MCP tools", () => {
  it("prefix every tool with feedback_ and expose the changelog collection", () => {
    expect(mcp.tools?.every((t) => t.name.startsWith("feedback_"))).toBe(true);
    expect(mcp.collections?.map((c) => c.slug)).toEqual([
      "mod-feedback-changelog",
    ]);
  });

  it("refuse callers who aren't feedback staff", async () => {
    await expect(
      tool("feedback_search_posts").run({ query: run }, ctx(ids.member)),
    ).rejects.toThrow(/feedback staff/);
  });

  it("search finds the post", async () => {
    const res = (await tool("feedback_search_posts").run(
      { query: `findable ${run}`, board: BOARD },
      ctx(ids.staff),
    )) as { posts: { id: string; url: string }[] };
    expect(res.posts.map((p) => p.id)).toEqual([postId]);
    // The slug comes from the title (trigger), not the "x" inserted.
    expect(res.posts[0]?.url).toMatch(
      new RegExp(`^https://app\\.test/feedback/${BOARD}/p/mcp-findable`),
    );
  });

  it("status changes and comments are attributed to the caller", async () => {
    const res = (await tool("feedback_set_status").run(
      { postId, status: `planned ${run}`, notifyVoters: false },
      ctx(ids.staff),
    )) as { changed: boolean };
    expect(res.changed).toBe(true);
    const { data: change } = await admin
      .from("mod_feedback_status_changes")
      .select("to_status_id, changed_by")
      .eq("post_id", postId)
      .single();
    expect(change).toEqual({ to_status_id: ST_PLANNED, changed_by: ids.staff });

    await tool("feedback_comment").run(
      { postId, body: "Looking into it", internal: true },
      ctx(ids.staff),
    );
    const read = (await tool("feedback_get_post").run(
      { postId },
      ctx(ids.staff),
    )) as {
      comments: { author_id: string; is_internal: boolean }[];
      statusHistory: unknown[];
    };
    expect(read.comments).toEqual([
      expect.objectContaining({ author_id: ids.staff, is_internal: true }),
    ]);
    expect(read.statusHistory).toHaveLength(1);
  });

  it("creates an idea, links the post and reports unknown statuses clearly", async () => {
    const res = (await tool("feedback_create_idea").run(
      { title: `Idea ${run}`, postIds: [postId] },
      ctx(ids.staff),
    )) as { ideaId: string; linked: string[] };
    expect(res.linked).toEqual([postId]);
    const { data: idea } = await admin
      .from("mod_feedback_ideas")
      .select("created_by")
      .eq("id", res.ideaId)
      .single();
    expect(idea?.created_by).toBe(ids.staff);
    await expect(
      tool("feedback_set_status").run(
        { postId, status: "nope" },
        ctx(ids.staff),
      ),
    ).rejects.toThrow(/Unknown status "nope"/);
  });
});

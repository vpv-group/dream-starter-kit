/**
 * Feedback module RLS + trigger contract (001_initial.sql), run by the kit's
 * `pnpm test:rls`: board visibility, anonymous JWTs never writing directly,
 * members voting/commenting only as themselves, server-controlled columns,
 * staff-only status/merge, internal notes, and the anonymous-data handlers.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@acme/api/types";
import {
  admin,
  anonClient,
  anonymousUser,
  createUser,
  signIn,
  testEmail,
} from "@acme/rls-tests/helpers";

type Client = SupabaseClient<Database>;

const run = Date.now().toString(36);
const BOARD_PUBLIC = `rls-pub-${run}`;
const BOARD_STAFF = `rls-staff-${run}`;
const BOARD_MEMBERS = `rls-mem-${run}`;
const ST_OPEN = `rls-open-${run}`;
const ST_DONE = `rls-done-${run}`;

const emails = {
  alice: testEmail("fb-alice"),
  bob: testEmail("fb-bob"),
  staff: testEmail("fb-staff"),
};
const ids = { alice: "", bob: "", staff: "" };
let alice: Client;
let bob: Client;
let staff: Client;
let publicPost = "";
let staffPost = "";

async function userId(client: Client): Promise<string> {
  const { data } = await client.auth.getUser();
  if (!data.user) throw new Error("no session");
  return data.user.id;
}

async function post(board: string, title: string) {
  const { data, error } = await admin
    .from("mod_feedback_posts")
    .insert({
      board_id: board,
      title,
      slug: "x",
      source: "staff",
      status_id: ST_OPEN,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

beforeAll(async () => {
  const boards = [
    { id: BOARD_PUBLIC, slug: BOARD_PUBLIC, name: "Public", access: "public" },
    { id: BOARD_STAFF, slug: BOARD_STAFF, name: "Private", access: "staff" },
    {
      id: BOARD_MEMBERS,
      slug: BOARD_MEMBERS,
      name: "Members",
      access: "members",
    },
  ];
  await admin.from("mod_feedback_boards").upsert(boards).throwOnError();
  await admin
    .from("mod_feedback_statuses")
    .upsert([
      { id: ST_OPEN, name: "Open", type: "open", position: 900 },
      { id: ST_DONE, name: "Done", type: "complete", position: 901 },
    ])
    .throwOnError();

  ids.alice = await createUser(emails.alice);
  ids.bob = await createUser(emails.bob);
  ids.staff = await createUser(emails.staff);
  await admin
    .from("profiles")
    .update({ is_staff: true })
    .eq("id", ids.staff)
    .throwOnError();
  alice = await signIn(emails.alice);
  bob = await signIn(emails.bob);
  staff = await signIn(emails.staff);

  publicPost = await post(BOARD_PUBLIC, "Public idea");
  staffPost = await post(BOARD_STAFF, "Secret idea");
});

afterAll(async () => {
  await admin
    .from("mod_feedback_posts")
    .delete()
    .in("board_id", [BOARD_PUBLIC, BOARD_STAFF, BOARD_MEMBERS]);
  await admin
    .from("mod_feedback_boards")
    .delete()
    .in("id", [BOARD_PUBLIC, BOARD_STAFF, BOARD_MEMBERS]);
  await admin
    .from("mod_feedback_statuses")
    .delete()
    .in("id", [ST_OPEN, ST_DONE]);
  for (const id of Object.values(ids))
    if (id) await admin.auth.admin.deleteUser(id);
});

describe("board visibility", () => {
  it("logged-out visitors see public boards only", async () => {
    const { data } = await anonClient()
      .from("mod_feedback_posts")
      .select("id")
      .in("id", [publicPost, staffPost]);
    expect(data?.map((p) => p.id)).toEqual([publicPost]);
  });

  it("members boards need a non-anonymous account", async () => {
    const memberPost = await post(BOARD_MEMBERS, "Members idea");
    const anon = await anonymousUser();
    const asAnon = await anon
      .from("mod_feedback_posts")
      .select("id")
      .eq("id", memberPost);
    expect(asAnon.data).toEqual([]);
    const asAlice = await alice
      .from("mod_feedback_posts")
      .select("id")
      .eq("id", memberPost);
    expect(asAlice.data).toHaveLength(1);
  });

  it("staff boards are staff-only", async () => {
    const asAlice = await alice
      .from("mod_feedback_posts")
      .select("id")
      .eq("id", staffPost);
    expect(asAlice.data).toEqual([]);
    const asStaff = await staff
      .from("mod_feedback_posts")
      .select("id")
      .eq("id", staffPost);
    expect(asStaff.data).toHaveLength(1);
  });
});

describe("anonymous JWTs never write directly", () => {
  it("can't vote, post or comment through the API", async () => {
    const anon = await anonymousUser();
    const anonId = await userId(anon);
    const vote = await anon
      .from("mod_feedback_votes")
      .insert({ post_id: publicPost, user_id: anonId });
    expect(vote.error).not.toBeNull();
    const newPost = await anon.from("mod_feedback_posts").insert({
      board_id: BOARD_PUBLIC,
      author_id: anonId,
      title: "spam",
      slug: "x",
    });
    expect(newPost.error).not.toBeNull();
    const comment = await anon
      .from("mod_feedback_comments")
      .insert({ post_id: publicPost, author_id: anonId, body: "hi" });
    expect(comment.error).not.toBeNull();
  });
});

describe("members", () => {
  it("vote as themselves, never for someone else", async () => {
    const own = await alice
      .from("mod_feedback_votes")
      .insert({ post_id: publicPost, user_id: ids.alice });
    expect(own.error).toBeNull();
    const forBob = await alice
      .from("mod_feedback_votes")
      .insert({ post_id: publicPost, user_id: ids.bob });
    expect(forBob.error).not.toBeNull();
    const { data } = await admin
      .from("mod_feedback_posts")
      .select("vote_count")
      .eq("id", publicPost)
      .single();
    expect(data?.vote_count).toBe(1);
  });

  it("don't see other people's votes", async () => {
    const { data } = await bob
      .from("mod_feedback_votes")
      .select("user_id")
      .eq("post_id", publicPost);
    expect(data).toEqual([]);
  });

  it("can't vote on a staff board", async () => {
    const res = await alice
      .from("mod_feedback_votes")
      .insert({ post_id: staffPost, user_id: ids.alice });
    expect(res.error).not.toBeNull();
  });

  it("server-controlled columns are forced on insert", async () => {
    const { data, error } = await alice
      .from("mod_feedback_posts")
      .insert({
        board_id: BOARD_PUBLIC,
        author_id: ids.alice,
        title: "My idea",
        slug: "anything",
        status_id: ST_DONE,
        pinned: true,
        vote_count: 999,
        source: "api",
      })
      .select("status_id, pinned, vote_count, source, slug, approval_state")
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({
      pinned: false,
      vote_count: 0,
      source: "portal",
      slug: "my-idea",
      approval_state: "approved",
    });
    expect(data?.status_id).not.toBe(ST_DONE);
  });

  it("can't change status, pin or counters", async () => {
    const { data: mine } = await alice
      .from("mod_feedback_posts")
      .select("id")
      .eq("author_id", ids.alice)
      .limit(1)
      .single();
    const mineId = mine?.id ?? "";
    const res = await alice
      .from("mod_feedback_posts")
      .update({ status_id: ST_DONE })
      .eq("id", mineId);
    expect(res.error?.code).toBe("42501");
    const edit = await alice
      .from("mod_feedback_posts")
      .update({ title: "My better idea" })
      .eq("id", mineId);
    expect(edit.error).toBeNull();
  });

  it("can't call the staff functions", async () => {
    const res = await alice.rpc("mod_feedback_set_status", {
      _post: publicPost,
      _status: ST_DONE,
    });
    expect(res.error?.code).toBe("42501");
    const merge = await alice.rpc("mod_feedback_merge_posts", {
      _source: publicPost,
      _target: staffPost,
    });
    expect(merge.error?.code).toBe("42501");
  });
});

describe("staff", () => {
  it("change status with history", async () => {
    const { data: changeId, error } = await staff.rpc(
      "mod_feedback_set_status",
      {
        _post: publicPost,
        _status: ST_DONE,
        _message: "Shipped!",
      },
    );
    expect(error).toBeNull();
    expect(changeId).toBeTruthy();
    const again = await staff.rpc("mod_feedback_set_status", {
      _post: publicPost,
      _status: ST_DONE,
    });
    expect(again.data).toBeNull(); // same status: nothing happens
    const { data } = await anonClient()
      .from("mod_feedback_status_changes")
      .select("to_status_id, message")
      .eq("post_id", publicPost);
    expect(data).toEqual([{ to_status_id: ST_DONE, message: "Shipped!" }]);
  });

  it("internal notes are hidden from members", async () => {
    await staff
      .from("mod_feedback_comments")
      .insert({
        post_id: publicPost,
        author_id: ids.staff,
        body: "internal",
        is_internal: true,
      })
      .throwOnError();
    await alice
      .from("mod_feedback_comments")
      .insert({
        post_id: publicPost,
        author_id: ids.alice,
        body: "public",
        is_internal: true,
      })
      .throwOnError();
    const asBob = await bob
      .from("mod_feedback_comments")
      .select("body, is_internal")
      .eq("post_id", publicPost);
    // Alice's is_internal was forced to false; staff's note is hidden.
    expect(asBob.data).toEqual([{ body: "public", is_internal: false }]);
    const asStaff = await staff
      .from("mod_feedback_comments")
      .select("body")
      .eq("post_id", publicPost);
    expect(asStaff.data).toHaveLength(2);
  });

  it("merge moves voters and unmerge restores", async () => {
    const target = await post(BOARD_PUBLIC, "Target idea");
    await bob
      .from("mod_feedback_votes")
      .insert({ post_id: target, user_id: ids.bob })
      .throwOnError();
    const merged = await staff.rpc("mod_feedback_merge_posts", {
      _source: publicPost,
      _target: target,
    });
    expect(merged.error).toBeNull();
    const count = async () =>
      (
        await admin
          .from("mod_feedback_posts")
          .select("vote_count")
          .eq("id", target)
          .single()
      ).data?.vote_count;
    expect(await count()).toBe(2); // bob + alice (copied from the source)
    const unmerge = await staff.rpc("mod_feedback_unmerge_post", {
      _source: publicPost,
    });
    expect(unmerge.error).toBeNull();
    expect(await count()).toBe(1);
  });
});

describe("anonymous-data handlers", () => {
  it("are not callable by clients", async () => {
    const has = await alice.rpc("mod_feedback_anon_has_data", {
      _user: ids.alice,
    });
    expect(has.data).toBe(false);
    const merge = await alice.rpc("mod_feedback_merge_anon", {
      _from: ids.alice,
      _to: ids.bob,
    });
    expect(merge.error?.code).toBe("42501");
  });

  it("kit_merge_anon_data moves an anonymous voter's vote", async () => {
    const anon = await anonymousUser();
    const anonId = await userId(anon);
    const target = await post(BOARD_PUBLIC, "Anon voted here");
    // Anonymous votes are written by the module's route with the service role.
    await admin
      .from("mod_feedback_votes")
      .insert({ post_id: target, user_id: anonId })
      .throwOnError();
    const { data: report, error } = await admin.rpc("kit_merge_anon_data", {
      _from: anonId,
      _to: ids.bob,
    });
    expect(error).toBeNull();
    expect((report as Record<string, string>).feedback).toBe("ok");
    const { data } = await admin
      .from("mod_feedback_votes")
      .select("user_id")
      .eq("post_id", target);
    expect(data).toEqual([{ user_id: ids.bob }]);
    await admin.auth.admin.deleteUser(anonId);
  });
});

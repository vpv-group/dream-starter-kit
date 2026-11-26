/**
 * Autopilot (005_autopilot.sql + src/server/autopilot.ts) against the live
 * database with a deterministic fake AI: new posts get embedded, filed and
 * checked for duplicates (suggested in manual mode, merged in automated
 * mode); ingested feedback is triaged and becomes a post or a vote only when
 * staff accept it; the inbox and API keys are staff-only.
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

import type { FeedbackAi } from "../../src/server/ai";
import {
  autopilotSettings,
  ingestFeedback,
  processInbox,
  processNewPosts,
  resolveInboxItem,
  summarizePost,
} from "../../src/server/autopilot";

type Client = SupabaseClient<Database>;

const run = Date.now().toString(36);
const BOARD = `rls-ap-${run}`;
const CAT = `rls-ap-ui-${run}`;
const ST_OPEN = `rls-ap-open-${run}`;
const emails = { staff: testEmail("ap-staff"), member: testEmail("ap-member") };
const ids = { staff: "", member: "" };
let staff: Client;
let member: Client;

/** One axis per topic, so "same topic" means cosine similarity 1. */
const TOPICS = ["dark mode", "csv export", "calendar sync"];
const fakeAi: FeedbackAi & { calls: string[] } = {
  calls: [],
  embed(text) {
    this.calls.push("embed");
    const v = new Array<number>(1536).fill(0);
    const i = TOPICS.findIndex((t) => text.toLowerCase().includes(t));
    v[i === -1 ? 1000 + (text.length % 500) : i] = 1;
    return Promise.resolve(v);
  },
  object(prompt, schema) {
    this.calls.push("object");
    const answer = prompt.includes("Categories (id: name)")
      ? { key: CAT }
      : {
          isFeedback: !prompt.includes("thanks, all good"),
          title: "Calendar sync",
          summary: "Sync with Google Calendar",
        };
    return Promise.resolve(schema.parse(answer));
  },
  text() {
    this.calls.push("text");
    return Promise.resolve("- People want it\n- Mostly for teams");
  },
};

const settings = (over: Record<string, unknown> = {}) =>
  autopilotSettings({ dailyCap: 100000, apiBoard: BOARD, ...over });

async function post(
  title: string,
  details = "Some longer details about this request.",
) {
  const { data, error } = await admin
    .from("mod_feedback_posts")
    .insert({
      board_id: BOARD,
      title,
      details,
      slug: "x",
      source: "portal",
      status_id: ST_OPEN,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Only this file's posts are unprocessed, so runs are deterministic. */
const settleOthers = () =>
  admin
    .from("mod_feedback_posts")
    .update({ ai_processed_at: new Date().toISOString() })
    .is("ai_processed_at", null)
    .neq("board_id", BOARD)
    .throwOnError();

beforeAll(async () => {
  await admin
    .from("mod_feedback_boards")
    .upsert({ id: BOARD, slug: BOARD, name: "Autopilot", access: "public" })
    .throwOnError();
  await admin
    .from("mod_feedback_categories")
    .upsert({ id: CAT, board_id: BOARD, name: "UI", slug: "ui" })
    .throwOnError();
  await admin
    .from("mod_feedback_statuses")
    .upsert({ id: ST_OPEN, name: "Open", type: "open", position: 990 })
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
});

afterAll(async () => {
  // Posts reference the board, so they go first (their inbox rows cascade).
  await admin.from("mod_feedback_posts").delete().eq("board_id", BOARD);
  await admin.from("mod_feedback_boards").delete().eq("id", BOARD);
  await admin.from("mod_feedback_statuses").delete().eq("id", ST_OPEN);
  await admin.from("mod_feedback_inbox").delete().eq("source", `test-${run}`);
  await admin.auth.admin.deleteUser(ids.staff);
  await admin.auth.admin.deleteUser(ids.member);
});

describe("autopilot: new posts", () => {
  let original = "";
  let dupe = "";

  it("embeds, files and suggests a duplicate for review (manual mode)", async () => {
    original = await post("Dark mode");
    await settleOthers();
    await processNewPosts(admin, fakeAi, settings());
    dupe = await post("Please add dark mode");
    await settleOthers();
    const result = await processNewPosts(admin, fakeAi, settings());
    expect(result.duplicates).toBe(1);
    expect(result.merged).toBe(0);

    const { data: p } = await admin
      .from("mod_feedback_posts")
      .select("category_id, ai_processed_at, embedding, merged_into_id")
      .eq("id", dupe)
      .single();
    expect(p?.category_id).toBe(CAT);
    expect(p?.ai_processed_at).not.toBeNull();
    expect(p?.embedding).not.toBeNull();
    expect(p?.merged_into_id).toBeNull();

    const { data: item } = await admin
      .from("mod_feedback_inbox")
      .select("state, suggested_post_id, confidence")
      .eq("post_id", dupe)
      .single();
    expect(item?.state).toBe("pending");
    expect(item?.suggested_post_id).toBe(original);
    expect(item?.confidence).toBeGreaterThan(0.99);
  });

  it("processes each post once", async () => {
    await settleOthers();
    const again = await processNewPosts(admin, fakeAi, settings());
    expect(again.processed).toBe(0);
  });

  it("merges portal duplicates as votes in automated mode, logged for undo", async () => {
    const third = await post("Dark mode for the dashboard");
    await settleOthers();
    const result = await processNewPosts(
      admin,
      fakeAi,
      settings({ actions: "automated" }),
    );
    expect(result.merged).toBe(1);
    const { data: p } = await admin
      .from("mod_feedback_posts")
      .select("merged_into_id")
      .eq("id", third)
      .single();
    expect(p?.merged_into_id).toBe(original);
    const { data: item } = await admin
      .from("mod_feedback_inbox")
      .select("state, resolved_by")
      .eq("post_id", third)
      .single();
    expect(item).toEqual({ state: "merged", resolved_by: null });
  });

  it("staff merge a suggested duplicate from the inbox", async () => {
    const { data: item } = await admin
      .from("mod_feedback_inbox")
      .select("id")
      .eq("post_id", dupe)
      .single();
    await resolveInboxItem(admin, ids.staff, item?.id ?? "", "merge");
    const { data: p } = await admin
      .from("mod_feedback_posts")
      .select("merged_into_id")
      .eq("id", dupe)
      .single();
    expect(p?.merged_into_id).toBe(original);
  });

  it("summaries are cached until the thread changes", async () => {
    fakeAi.calls.length = 0;
    const first = await summarizePost(admin, fakeAi, original);
    const second = await summarizePost(admin, fakeAi, original);
    expect(second).toBe(first);
    expect(fakeAi.calls.filter((c) => c === "text")).toHaveLength(1);
  });
});

describe("autopilot: ingested feedback", () => {
  it("triages API feedback, then creates a post only when staff accept", async () => {
    const id = await ingestFeedback(admin, {
      source: `test-${run}`,
      text: "We really need calendar sync with Google",
      email: emails.member,
    });
    await processInbox(admin, fakeAi, settings());
    const { data: item } = await admin
      .from("mod_feedback_inbox")
      .select("title, suggested_board_id, state, confidence")
      .eq("id", id)
      .single();
    expect(item?.title).toBe("Calendar sync");
    expect(item?.suggested_board_id).toBe(BOARD);
    expect(item?.state).toBe("pending");
    expect(item?.confidence).not.toBeNull();

    const { postId } = await resolveInboxItem(admin, ids.staff, id, "accept");
    const { data: p } = await admin
      .from("mod_feedback_posts")
      .select("board_id, author_id, title, approval_state")
      .eq("id", postId ?? "")
      .single();
    expect(p?.board_id).toBe(BOARD);
    expect(p?.author_id).toBe(ids.member); // matched by email
    expect(p?.title).toBe("Calendar sync");
  });

  it("adds feedback to an existing post as an internal note + the author's vote", async () => {
    const target = await post("CSV export");
    const id = await ingestFeedback(admin, {
      source: `test-${run}`,
      text: "csv export please",
      email: emails.member,
    });
    await resolveInboxItem(admin, ids.staff, id, "merge", target);
    const { data: vote } = await admin
      .from("mod_feedback_votes")
      .select("user_id")
      .eq("post_id", target)
      .eq("user_id", ids.member)
      .maybeSingle();
    expect(vote).not.toBeNull();
    const { data: note } = await admin
      .from("mod_feedback_comments")
      .select("is_internal, body")
      .eq("post_id", target)
      .single();
    expect(note?.is_internal).toBe(true);
    expect(note?.body).toContain("csv export please");
  });

  it("dismisses messages that aren't feedback", async () => {
    const id = await ingestFeedback(admin, {
      source: `test-${run}`,
      text: "thanks, all good now",
    });
    await processInbox(admin, fakeAi, settings());
    const { data: item } = await admin
      .from("mod_feedback_inbox")
      .select("state")
      .eq("id", id)
      .single();
    expect(item?.state).toBe("dismissed");
  });
});

describe("autopilot: access", () => {
  beforeAll(async () => {
    await ingestFeedback(admin, {
      source: `test-${run}`,
      text: "visible to staff",
    });
    await admin
      .from("mod_feedback_api_keys")
      .insert({ prefix: `fbk_${run}`.slice(0, 10), key_hash: `hash-${run}` })
      .throwOnError();
  });
  afterAll(async () => {
    await admin
      .from("mod_feedback_api_keys")
      .delete()
      .eq("key_hash", `hash-${run}`);
  });

  it("staff read the inbox and keys; members and visitors can't", async () => {
    const staffInbox = await staff
      .from("mod_feedback_inbox")
      .select("id")
      .eq("source", `test-${run}`);
    expect(staffInbox.data?.length).toBeGreaterThan(0);
    const staffKeys = await staff
      .from("mod_feedback_api_keys")
      .select("key_hash")
      .eq("key_hash", `hash-${run}`);
    expect(staffKeys.data).toHaveLength(1);

    for (const client of [member, anonClient()]) {
      const inbox = await client
        .from("mod_feedback_inbox")
        .select("id")
        .eq("source", `test-${run}`);
      expect(inbox.data ?? []).toHaveLength(0);
      const keys = await client.from("mod_feedback_api_keys").select("id");
      expect(keys.data ?? []).toHaveLength(0);
    }
  });

  it("members can't write the inbox or mint keys", async () => {
    const inbox = await member
      .from("mod_feedback_inbox")
      .insert({ kind: "extracted", raw_text: "x", source: `test-${run}` });
    expect(inbox.error).not.toBeNull();
    const key = await staff
      .from("mod_feedback_api_keys")
      .insert({ prefix: "fbk_x", key_hash: `staff-${run}` });
    expect(key.error).not.toBeNull(); // even staff: keys are minted server-side
  });
});

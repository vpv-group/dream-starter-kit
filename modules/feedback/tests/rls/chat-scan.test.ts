/**
 * Feedback from chat (src/server/chat-source) against the live database: only users' messages that
 * pass the prefilter, from permanent accounts, are forwarded; the cursor
 * advances so nothing is forwarded twice; the state table is server-only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  admin,
  anonClient,
  anonymousUser,
  createUser,
  signIn,
  testEmail,
} from "@acme/rls-tests/helpers";

import { DEFAULT_KEYWORDS } from "../../src/server/chat-source/filter";
import { scanChat } from "../../src/server/chat-source/scan";

// Chat tables through an untyped client: apps without chat still typecheck.
const chatDb = admin as unknown as SupabaseClient;
const email = testEmail("fsc-member");
let userId = "";
let anonId = "";
const forwarded: { text: string; email?: string | null }[] = [];
const ingest = (
  _db: unknown,
  input: { text: string; email?: string | null },
) => {
  forwarded.push(input);
  return Promise.resolve(crypto.randomUUID());
};
const opts = { keywords: DEFAULT_KEYWORDS, minLength: 20, ingest };

async function thread(owner: string, messages: [string, string][]) {
  const { data } = await chatDb
    .from("mod_chat_threads")
    .insert({ user_id: owner, title: "t" })
    .select("id")
    .single()
    .throwOnError();
  for (const [role, content] of messages) {
    await chatDb
      .from("mod_chat_messages")
      .insert({ thread_id: data.id, role, content })
      .throwOnError();
  }
}

beforeAll(async () => {
  userId = await createUser(email);
  const anon = await anonymousUser();
  anonId = (await anon.auth.getUser()).data.user?.id ?? "";
  await admin
    .from("mod_feedback_chat_scan_state")
    .upsert({ id: 1, cursor: new Date(Date.now() - 1000).toISOString() })
    .throwOnError();
});

afterAll(async () => {
  await admin.from("mod_feedback_chat_scan_state").delete().eq("id", 1);
  await admin.auth.admin.deleteUser(userId);
  if (anonId) await admin.auth.admin.deleteUser(anonId);
});

// The chat module is optional: without it there is nothing to scan.
const chatInstalled = !(
  await chatDb.from("mod_chat_messages").select("id").limit(1)
).error;

describe.skipIf(!chatInstalled)("feedback from chat", () => {
  it("forwards feedback-like user messages from permanent accounts", async () => {
    await thread(userId, [
      ["user", "It would be nice to export reports as CSV please"],
      ["assistant", "Thanks! This feature would be nice indeed."],
      ["user", "what's the weather like today?"],
    ]);
    await thread(anonId, [["user", "This feature is broken for me sadly"]]);
    const result = await scanChat(admin, opts);
    expect("scanned" in result && result.scanned).toBeGreaterThanOrEqual(3);
    const mine = forwarded.filter((f) => f.email === email);
    expect(mine.map((f) => f.text)).toEqual([
      "It would be nice to export reports as CSV please",
    ]);
    expect(forwarded.some((f) => f.text.includes("broken for me"))).toBe(false);
  });

  it("doesn't forward the same message twice", async () => {
    const before = forwarded.length;
    await scanChat(admin, opts);
    expect(forwarded.length).toBe(before);
  });

  it("keeps the scan state away from clients", async () => {
    const member = await signIn(email);
    for (const client of [member, anonClient()]) {
      const { data } = await client
        .from("mod_feedback_chat_scan_state")
        .select("*");
      expect(data ?? []).toHaveLength(0);
      const write = await client
        .from("mod_feedback_chat_scan_state")
        .update({ forwarded: 0 })
        .eq("id", 1)
        .select();
      expect(write.data ?? []).toHaveLength(0);
    }
  });
});

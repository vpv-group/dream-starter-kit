/** Changelog support tables (003_changelog.sql): own-row access, public likes. */
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

const emails = { a: testEmail("cl-a"), b: testEmail("cl-b") };
const ids = { a: "", b: "" };
let a: Client;
let b: Client;
const ENTRY = `rls-entry-${Date.now()}`;

beforeAll(async () => {
  ids.a = await createUser(emails.a);
  ids.b = await createUser(emails.b);
  a = await signIn(emails.a);
  b = await signIn(emails.b);
});

afterAll(async () => {
  await admin
    .from("mod_feedback_changelog_reactions")
    .delete()
    .eq("entry_id", ENTRY);
  for (const id of Object.values(ids))
    if (id) await admin.auth.admin.deleteUser(id);
});

describe("changelog tables", () => {
  it("likes are public to read, written only as yourself", async () => {
    await a
      .from("mod_feedback_changelog_reactions")
      .insert({ entry_id: ENTRY, user_id: ids.a })
      .throwOnError();
    const forB = await a
      .from("mod_feedback_changelog_reactions")
      .insert({ entry_id: ENTRY, user_id: ids.b });
    expect(forB.error).not.toBeNull();
    const { data } = await anonClient().rpc("mod_feedback_changelog_likes", {
      _entries: [ENTRY],
    });
    expect(data).toEqual([{ entry_id: ENTRY, likes: 1, mine: false }]);
  });

  it("subscriptions and read markers are private", async () => {
    await a
      .from("mod_feedback_changelog_subscribers")
      .insert({ user_id: ids.a })
      .throwOnError();
    const asB = await b
      .from("mod_feedback_changelog_subscribers")
      .select("user_id");
    expect(asB.data).toEqual([]);
    const forB = await a
      .from("mod_feedback_changelog_subscribers")
      .insert({ user_id: ids.b });
    expect(forB.error).not.toBeNull();
  });

  it("anonymous JWTs can't subscribe or like directly", async () => {
    const anon = await anonymousUser();
    const { data } = await anon.auth.getUser();
    const id = data.user?.id ?? "";
    const sub = await anon
      .from("mod_feedback_changelog_subscribers")
      .insert({ user_id: id });
    expect(sub.error).not.toBeNull();
    const like = await anon
      .from("mod_feedback_changelog_reactions")
      .insert({ entry_id: ENTRY, user_id: id });
    expect(like.error).not.toBeNull();
    await admin.auth.admin.deleteUser(id);
  });
});

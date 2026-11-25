/**
 * Notifications 1.1 producer contract (003_contract.sql), run by the kit's
 * `pnpm test:rls`: who may call mod_notifications_emit, dedupe, the category
 * registry's read-only policy, and the url/channel constraints.
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

type Client = SupabaseClient<Database>;

const emails = { alice: testEmail("notif-alice"), bob: testEmail("notif-bob") };
const ids = { alice: "", bob: "" };
let alice: Client;
const CATEGORY = "rls-test.contract.ping";

beforeAll(async () => {
  ids.alice = await createUser(emails.alice);
  ids.bob = await createUser(emails.bob);
  alice = await signIn(emails.alice);
  const { error } = await admin.rpc("mod_notifications_register_category", {
    _key: CATEGORY,
    _module: "rls-test",
    _label: "RLS test",
    _audience: "everyone",
    _default_channels: ["in_app"],
  });
  if (error) throw error;
});

afterAll(async () => {
  await admin.rpc("mod_notifications_unregister_module", {
    _module: "rls-test",
  });
  for (const id of Object.values(ids)) {
    if (id) await admin.auth.admin.deleteUser(id);
  }
});

describe("mod_notifications_emit", () => {
  it("lets system code (service role) notify any user, with dedupe", async () => {
    const args = {
      _user: ids.bob,
      _category: CATEGORY,
      _title: "Hello Bob",
      _url: "/a/notifications",
      _entity_type: "test",
      _entity_id: "1",
      _channels: ["in_app", "email"],
      _payload: { email: { subject: "Hi", text: "Hi" } },
      _dedupe_key: `contract-${ids.bob}`,
    };
    const first = await admin.rpc("mod_notifications_emit", args);
    expect(first.error).toBeNull();
    expect(first.data).toBeTruthy();

    const again = await admin.rpc("mod_notifications_emit", args);
    expect(again.error).toBeNull();
    expect(again.data).toBeNull();

    const { data: rows } = await admin
      .from("mod_notifications")
      .select("category, source_module, url, channels, payload, data")
      .eq("user_id", ids.bob)
      .eq("dedupe_key", args._dedupe_key);
    expect(rows).toHaveLength(1);
    expect(rows?.[0]).toMatchObject({
      category: CATEGORY,
      source_module: "rls-test",
      url: "/a/notifications",
      channels: ["in_app", "email"],
      data: { url: "/a/notifications" },
    });
  });

  it("refuses a signed-in client notifying someone else", async () => {
    const { error } = await alice.rpc("mod_notifications_emit", {
      _user: ids.bob,
      _category: CATEGORY,
      _title: "spam",
    });
    expect(error?.code).toBe("42501");
  });

  it("lets a signed-in client notify themself", async () => {
    const { data, error } = await alice.rpc("mod_notifications_emit", {
      _user: ids.alice,
      _category: CATEGORY,
      _title: "note to self",
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();
  });

  it("refuses anon", async () => {
    const { error } = await anonClient().rpc("mod_notifications_emit", {
      _user: ids.bob,
      _category: CATEGORY,
    });
    expect(error).not.toBeNull();
  });

  it("rejects unsafe urls and unknown channels", async () => {
    const bad = await admin.rpc("mod_notifications_emit", {
      _user: ids.bob,
      _category: CATEGORY,
      _url: "javascript:alert(1)",
    });
    expect(bad.error?.code).toBe("23514");
    const channel = await admin.rpc("mod_notifications_emit", {
      _user: ids.bob,
      _category: CATEGORY,
      _channels: ["carrier-pigeon"],
    });
    expect(channel.error?.code).toBe("23514");
  });
});

describe("direct writes keep the 1.0 rules", () => {
  it("a client can't insert a notification for another user", async () => {
    const { error } = await alice.from("mod_notifications").insert({
      user_id: ids.bob,
      type: CATEGORY,
    });
    expect(error).not.toBeNull();
  });
});

describe("mod_notifications_categories", () => {
  it("is readable by signed-in users", async () => {
    const { data, error } = await alice
      .from("mod_notifications_categories")
      .select("key, audience, default_channels")
      .eq("key", CATEGORY);
    expect(error).toBeNull();
    expect(data).toEqual([
      { key: CATEGORY, audience: "everyone", default_channels: ["in_app"] },
    ]);
  });

  it("is not writable by clients", async () => {
    const insert = await alice.from("mod_notifications_categories").insert({
      key: "rls-test.contract.hijack",
      module: "rls-test",
      label: "nope",
    });
    expect(insert.error).not.toBeNull();
    const rpc = await alice.rpc("mod_notifications_register_category", {
      _key: "rls-test.contract.hijack",
      _module: "rls-test",
      _label: "nope",
    });
    expect(rpc.error?.code).toBe("42501");
  });

  it("is hidden from anon", async () => {
    const { data } = await anonClient()
      .from("mod_notifications_categories")
      .select("key");
    expect(data ?? []).toEqual([]);
  });
});

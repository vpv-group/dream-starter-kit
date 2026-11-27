/**
 * kit_embed_origins (20261127030000_embed_origins.sql): anyone may read a
 * module's framing allowlist (proxy.ts does, with the anon key), only the
 * service role may change it, and bad origins never get stored.
 */
import { afterAll, describe, expect, it } from "vitest";

import { admin, anonClient, createUser, signIn, testEmail } from "./helpers";

const MODULE = `embedtest-${Date.now().toString(36)}`;
const email = testEmail("embed-member");
let userId = "";

afterAll(async () => {
  await admin.from("kit_embed_origins").delete().eq("module", MODULE);
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe("kit_embed_origins", () => {
  it("the service role replaces a module's list atomically", async () => {
    await admin
      .rpc("kit_set_embed_origins", {
        _module: MODULE,
        _origins: ["https://a.example.com", "https://b.example.com"],
      })
      .throwOnError();
    await admin
      .rpc("kit_set_embed_origins", {
        _module: MODULE,
        _origins: ["https://b.example.com", "http://localhost:4321"],
      })
      .throwOnError();
    const { data } = await anonClient()
      .from("kit_embed_origins")
      .select("origin")
      .eq("module", MODULE)
      .order("origin");
    expect(data?.map((r) => r.origin)).toEqual([
      "http://localhost:4321",
      "https://b.example.com",
    ]);
  });

  it("rejects origins that aren't plain https (or local http)", async () => {
    const { error } = await admin.rpc("kit_set_embed_origins", {
      _module: MODULE,
      _origins: ["https://ok.example.com; script-src *"],
    });
    expect(error).not.toBeNull();
  });

  it("members and visitors can't change it", async () => {
    userId = await createUser(email);
    const member = await signIn(email);
    for (const client of [member, anonClient()]) {
      const rpc = await client.rpc("kit_set_embed_origins", {
        _module: MODULE,
        _origins: ["https://evil.example.com"],
      });
      expect(rpc.error).not.toBeNull();
      const insert = await client
        .from("kit_embed_origins")
        .insert({ module: MODULE, origin: "https://evil.example.com" });
      expect(insert.error).not.toBeNull();
    }
    const { data } = await admin
      .from("kit_embed_origins")
      .select("origin")
      .eq("module", MODULE);
    expect(data?.some((r) => r.origin.includes("evil"))).toBe(false);
  });
});

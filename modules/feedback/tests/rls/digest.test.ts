/**
 * Staff digest (007_digest.sql + src/server/digest.ts) against the live
 * database: opted-in staff get one email per period (a retry sends nothing),
 * opted-out staff get none, prefs are own-row and staff-only, and the run
 * table is closed to clients.
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

import { runDigest } from "../../src/server/digest";

type Client = SupabaseClient<Database>;

const run = Date.now().toString(36);
const BOARD = `rls-dig-${run}`;
// A Monday far in the future, so the period key is unique to this test.
const NOW = new Date("2031-03-03T14:17:00Z");
const PERIOD = "weekly:2031-03-03";
const emails = {
  on: testEmail("dig-on"),
  off: testEmail("dig-off"),
  member: testEmail("dig-member"),
};
const ids = { on: "", off: "", member: "" };
let on: Client;
let off: Client;
let member: Client;
const sent: string[] = [];

const deps = () => ({
  db: admin,
  sendEmail: (m: { to: string }) => {
    sent.push(m.to);
    return Promise.resolve();
  },
  cadence: "weekly" as const,
  staleAfterWeeks: 4,
  appName: "Test",
  siteUrl: "https://app.test",
  now: NOW,
});

beforeAll(async () => {
  await admin
    .from("mod_feedback_digest_runs")
    .delete()
    .eq("period_key", PERIOD);
  await admin
    .from("mod_feedback_boards")
    .upsert({ id: BOARD, slug: BOARD, name: "Digest", access: "public" })
    .throwOnError();
  for (const k of ["on", "off", "member"] as const) {
    ids[k] = await createUser(emails[k]);
  }
  await admin
    .from("profiles")
    .update({ is_staff: true })
    .in("id", [ids.on, ids.off])
    .throwOnError();
  on = await signIn(emails.on);
  off = await signIn(emails.off);
  member = await signIn(emails.member);
  // Activity inside the digest window (the 7 days before NOW).
  await admin
    .from("mod_feedback_posts")
    .insert({ board_id: BOARD, title: "Digest me", slug: "x", source: "staff" })
    .throwOnError();
  await admin
    .from("mod_feedback_posts")
    .update({ created_at: new Date(NOW.getTime() - 86400_000).toISOString() })
    .eq("board_id", BOARD)
    .throwOnError();
});

afterAll(async () => {
  await admin
    .from("mod_feedback_digest_runs")
    .delete()
    .eq("period_key", PERIOD);
  await admin.from("mod_feedback_posts").delete().eq("board_id", BOARD);
  await admin.from("mod_feedback_boards").delete().eq("id", BOARD);
  for (const id of Object.values(ids)) await admin.auth.admin.deleteUser(id);
});

describe("staff digest", () => {
  it("staff set their own preference; members can't", async () => {
    const own = await off
      .from("mod_feedback_staff_prefs")
      .upsert({ user_id: ids.off, digest: false });
    expect(own.error).toBeNull();
    const other = await on
      .from("mod_feedback_staff_prefs")
      .upsert({ user_id: ids.off, digest: true });
    expect(other.error).not.toBeNull();
    const notStaff = await member
      .from("mod_feedback_staff_prefs")
      .upsert({ user_id: ids.member, digest: false });
    expect(notStaff.error).not.toBeNull();
  });

  it("emails opted-in staff once per period", async () => {
    const first = await runDigest(deps());
    expect(first.period).toBe(PERIOD);
    expect(sent).toContain(emails.on);
    expect(sent).not.toContain(emails.off);
    expect(sent).not.toContain(emails.member);
    const count = sent.length;
    const retry = await runDigest(deps());
    expect(retry.skipped).toBe("already sent");
    expect(sent.length).toBe(count);
  });

  it("isn't due on other days", async () => {
    const tuesday = await runDigest({
      ...deps(),
      now: new Date("2031-03-04T14:17:00Z"),
    });
    expect(tuesday.skipped).toBe("not due");
  });

  it("keeps the run log away from clients", async () => {
    for (const client of [on, anonClient()]) {
      const { data } = await client
        .from("mod_feedback_digest_runs")
        .select("*");
      expect(data ?? []).toHaveLength(0);
    }
  });
});

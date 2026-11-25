import { describe, expect, it } from "vitest";

import {
  defineNotificationCategories,
  isSafeNotificationUrl,
  notificationHref,
} from "../src/contract";
import { toNotificationRow, wantsPush } from "../src/server/row";

const USER = "00000000-0000-0000-0000-000000000001";

describe("toNotificationRow", () => {
  it("maps the 1.1 contract fields onto the row", () => {
    const row = toNotificationRow({
      userId: USER,
      category: "client-portal.case.reply",
      title: "New reply",
      body: "Ada replied to your ticket",
      url: "/a/client-portal/tickets/42",
      entity: { type: "case", id: "42" },
      actorId: USER,
      channels: ["in_app", "email"],
      payload: { email: { subject: "[#00001000] Hi", text: "Hello" } },
      dedupeKey: "case-comment:7:user",
    });
    expect(row).toMatchObject({
      user_id: USER,
      type: "client-portal.case.reply",
      category: "client-portal.case.reply",
      source_module: "client-portal",
      url: "/a/client-portal/tickets/42",
      entity_type: "case",
      entity_id: "42",
      actor_id: USER,
      channels: ["in_app", "email"],
      dedupe_key: "case-comment:7:user",
      payload: { email: { subject: "[#00001000] Hi", text: "Hello" } },
      data: { url: "/a/client-portal/tickets/42" },
    });
  });

  it("keeps legacy `type`-only producers working", () => {
    const row = toNotificationRow({
      userId: USER,
      type: "reminder.due",
      data: { reminderId: "r1" },
    });
    expect(row.type).toBe("reminder.due");
    expect(row.category).toBe("reminder.due");
    expect(row.source_module).toBe("reminder");
    expect(row.data).toEqual({ reminderId: "r1" });
    expect(row.payload).toEqual({});
  });

  it("requires a category", () => {
    expect(() => toNotificationRow({ userId: USER })).toThrow(/category/);
  });

  it("rejects unsafe click-through urls", () => {
    for (const url of [
      "javascript:alert(1)",
      "//evil.example/x",
      "/\\evil.example",
      "http://plain.example",
      "data:text/html,hi",
    ]) {
      expect(() =>
        toNotificationRow({ userId: USER, category: "a.b", url }),
      ).toThrow(/unsafe url/);
    }
  });
});

describe("wantsPush", () => {
  it("pushes by default and when push is a requested channel", () => {
    expect(wantsPush({ userId: USER, category: "a.b" })).toBe(true);
    expect(
      wantsPush({ userId: USER, category: "a.b", channels: ["push"] }),
    ).toBe(true);
  });
  it("skips push when not requested or explicitly disabled", () => {
    expect(
      wantsPush({ userId: USER, category: "a.b", channels: ["email"] }),
    ).toBe(false);
    expect(wantsPush({ userId: USER, category: "a.b", push: false })).toBe(
      false,
    );
  });
});

describe("notificationHref", () => {
  it("prefers the url column, then legacy data.url", () => {
    expect(notificationHref({ url: "/a/x", data: { url: "/a/y" } })).toBe(
      "/a/x",
    );
    expect(notificationHref({ url: null, data: { url: "/a/y" } })).toBe("/a/y");
    expect(notificationHref({ url: null, data: {} })).toBeNull();
  });
  it("never returns an unsafe target", () => {
    expect(notificationHref({ url: "javascript:alert(1)" })).toBeNull();
    expect(notificationHref({ data: { url: "//evil.example" } })).toBeNull();
    expect(isSafeNotificationUrl("/")).toBe(true);
    expect(isSafeNotificationUrl("https://example.com/a")).toBe(true);
  });
});

describe("defineNotificationCategories", () => {
  it("accepts valid keys and rejects malformed ones", () => {
    const cats = defineNotificationCategories({
      reply: { key: "client-portal.case.reply", label: "Ticket replies" },
    });
    expect(cats.reply.key).toBe("client-portal.case.reply");
    expect(() =>
      defineNotificationCategories({ bad: { key: "NoDots", label: "x" } }),
    ).toThrow(/invalid key/);
  });
});

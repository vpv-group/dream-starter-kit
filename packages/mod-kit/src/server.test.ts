import { describe, expect, it } from "vitest";

import { matchModRoute } from "./server";

describe("matchModRoute", () => {
  const table = {
    "GET /ping": "ping",
    "GET /files/*": "files",
    "GET /files/deep/*": "deep",
    "POST /files/*": "post-files",
  };

  it("prefers the exact key", () => {
    expect(matchModRoute(table, "GET", "/ping")).toEqual({
      handler: "ping",
      params: {},
    });
  });

  it("matches the longest wildcard prefix and returns the rest", () => {
    expect(matchModRoute(table, "GET", "/files/a/b")).toEqual({
      handler: "files",
      params: { "*": "a/b" },
    });
    expect(matchModRoute(table, "GET", "/files/deep/x")).toEqual({
      handler: "deep",
      params: { "*": "x" },
    });
    expect(matchModRoute(table, "POST", "/files/a")?.handler).toBe(
      "post-files",
    );
  });

  it("never matches the bare prefix, another method or a prototype key", () => {
    expect(matchModRoute(table, "GET", "/files/")).toBeNull();
    expect(matchModRoute(table, "GET", "/files")).toBeNull();
    expect(matchModRoute(table, "DELETE", "/files/a")).toBeNull();
    expect(matchModRoute(table, "GET", "/filesx")).toBeNull();
    expect(matchModRoute({}, "constructor", "")).toBeNull();
    expect(matchModRoute(undefined, "GET", "/ping")).toBeNull();
  });
});

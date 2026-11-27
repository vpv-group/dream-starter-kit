import { describe, expect, it } from "vitest";

import {
  matchModRoute,
  MOD_DEFAULT_RATE_LIMIT,
  modRateLimitBucket,
  routeRateLimit,
  withRateLimit,
} from "./server";

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
      key: "GET /ping",
    });
  });

  it("matches the longest wildcard prefix and returns the rest", () => {
    expect(matchModRoute(table, "GET", "/files/a/b")).toEqual({
      handler: "files",
      params: { "*": "a/b" },
      key: "GET /files/*",
    });
    expect(matchModRoute(table, "GET", "/files/deep/x")).toEqual({
      handler: "deep",
      params: { "*": "x" },
      key: "GET /files/deep/*",
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

describe("per-route rate limits", () => {
  const req = new Request("https://site.test/api/mod/m/x", {
    headers: { "x-api-key": "k1" },
  });
  const who = { route: "m POST /x", userId: null, ip: "1.2.3.4", req };
  const handler = () => new Response("ok");

  it("keeps the shared per-user (else per-IP) budget by default", () => {
    expect(routeRateLimit(handler)).toBeUndefined();
    expect(modRateLimitBucket(undefined, who)).toEqual({
      bucket: "ip:1.2.3.4",
      ...MOD_DEFAULT_RATE_LIMIT,
    });
    expect(
      modRateLimitBucket(undefined, { ...who, userId: "u1" })?.bucket,
    ).toBe("u1");
  });

  it("lets a route opt out, without changing the original handler", () => {
    const open = withRateLimit(handler, false);
    expect(routeRateLimit(open)).toBe(false);
    expect(routeRateLimit(handler)).toBeUndefined();
    expect(modRateLimitBucket(routeRateLimit(open), who)).toBeNull();
    expect(open()).toBeInstanceOf(Response);
  });

  it("gives a custom limit its own bucket, keyed as asked", () => {
    const byKey = withRateLimit(handler, {
      limit: 300,
      key: (r) => r.headers.get("x-api-key"),
    });
    expect(modRateLimitBucket(routeRateLimit(byKey), who)).toEqual({
      bucket: "m POST /x|key:k1",
      limit: 300,
      windowMs: 60_000,
    });
    const byIp = withRateLimit(handler, {
      limit: 5,
      windowMs: 1000,
      key: "ip",
    });
    expect(
      modRateLimitBucket(routeRateLimit(byIp), { ...who, userId: "u1" }),
    ).toEqual({
      bucket: "m POST /x|ip:1.2.3.4",
      limit: 5,
      windowMs: 1000,
    });
    const noKey = withRateLimit(handler, { limit: 5, key: () => null });
    expect(
      modRateLimitBucket(routeRateLimit(noKey), { ...who, userId: "u1" })
        ?.bucket,
    ).toBe("m POST /x|u1");
  });

  it("rejects a limit that isn't a positive integer", () => {
    expect(() => withRateLimit(handler, { limit: 0 })).toThrow();
    expect(() => withRateLimit(handler, { limit: 1.5 })).toThrow();
    expect(() => withRateLimit(handler, { limit: 5, windowMs: 0 })).toThrow();
  });
});

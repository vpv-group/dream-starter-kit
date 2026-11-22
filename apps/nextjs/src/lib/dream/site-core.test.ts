import { describe, expect, it, vi } from "vitest";

import type { DreamSiteState, SiteSyncDeps } from "./site-core";
import { DAY_MS, publicDomain, syncSite } from "./site-core";

const REGISTRY = "https://registry.test/api/mod/modules/v1";
const KEY = "dream_lk_SITEKEYSITEKEYSITEKEYSITEKEYSITEKEY1234";
const NOW = Date.UTC(2026, 10, 22, 12);

interface Call {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

/** A fake registry; `replies[path]` answers each endpoint (default 200). */
function fakeRegistry(
  replies: Record<string, { status: number; body: unknown }> = {},
  saved?: () => DreamSiteState,
) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
    const body = JSON.parse(
      typeof init?.body === "string" ? init.body : "{}",
    ) as Record<string, unknown>;
    calls.push({
      url,
      body,
      headers: init?.headers as Record<string, string>,
    });
    const path = url.slice(REGISTRY.length);
    if (path === "/sites/register" && saved) {
      // The registry checks the nonce the site is serving right now.
      const challenge = body.challenge as { nonce: string };
      expect(saved().nonce).toBe(challenge.nonce);
    }
    const reply = replies[path] ?? {
      status: 200,
      body:
        path === "/sites/challenge"
          ? {
              domain: body.domain,
              nonce: "n-123",
              expiresAt: 1,
              signature: "s",
            }
          : path === "/sites/register"
            ? { licenseKey: KEY, keyPrefix: "dream_lk_SITE" }
            : { ok: true },
    };
    return Promise.resolve(
      new Response(JSON.stringify(reply.body), { status: reply.status }),
    );
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

function makeDeps(
  overrides: Partial<SiteSyncDeps> = {},
  initial: DreamSiteState = {},
) {
  let state: DreamSiteState = { ...initial };
  const registry = fakeRegistry(
    (overrides as { replies?: never }).replies,
    () => state,
  );
  const deps: SiteSyncDeps = {
    registry: REGISTRY,
    domain: "app.acme.com",
    telemetry: true,
    kitVersion: "2.1.0",
    repo: "acme/app",
    people: () =>
      Promise.resolve({
        owner: "founder@acme.com",
        staff: ["editor@acme.com"],
      }),
    load: () => Promise.resolve(state),
    save: (patch) => {
      state = { ...state, ...patch };
      return Promise.resolve();
    },
    fetchImpl: registry.fetchImpl,
    now: () => NOW,
    ...overrides,
  };
  return { deps, calls: registry.calls, state: () => state };
}

describe("publicDomain", () => {
  it("keeps public hosts", () => {
    expect(publicDomain("https://App.Acme.com/")).toBe("app.acme.com");
    expect(publicDomain("https://my-app.vercel.app")).toBe("my-app.vercel.app");
  });
  it("drops local and private hosts", () => {
    for (const url of [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://[::1]:3000",
      "http://kit.local",
      "http://app.localhost",
      "not a url",
    ]) {
      expect(publicDomain(url), url).toBeNull();
    }
  });
});

describe("syncSite", () => {
  it("registers: challenge → serve nonce → register → store the key", async () => {
    const { deps, calls, state } = makeDeps();
    const result = await syncSite(deps, { force: true });
    expect(result).toEqual({
      status: "registered",
      keyPrefix: "dream_lk_SITE",
    });
    expect(calls.map((c) => c.url.slice(REGISTRY.length))).toEqual([
      "/sites/challenge",
      "/sites/register",
    ]);
    expect(calls[1]?.body).toMatchObject({
      kitVersion: "2.1.0",
      repo: "acme/app",
      owner: { email: "founder@acme.com" },
      staff: ["editor@acme.com"],
    });
    expect(state()).toMatchObject({
      licenseKey: KEY,
      licenseKeyPrefix: "dream_lk_SITE",
      domain: "app.acme.com",
      nonce: null,
      lastError: null,
    });
  });

  it("heartbeats with the site key once registered", async () => {
    const { deps, calls, state } = makeDeps(
      {},
      { licenseKey: KEY, domain: "app.acme.com" },
    );
    expect(await syncSite(deps)).toEqual({ status: "reported" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${REGISTRY}/sites/heartbeat`);
    expect(calls[0]?.headers["X-Dream-License-Key"]).toBe(KEY);
    expect(calls[0]?.body).toMatchObject({ staff: ["editor@acme.com"] });
    expect(state().lastReportedAt).toBe(new Date(NOW).toISOString());
  });

  it("re-registers when the site key was rotated (401)", async () => {
    const { deps, calls } = makeDeps(
      {
        replies: {
          "/sites/heartbeat": { status: 401, body: { code: "revoked_key" } },
        },
      } as never,
      { licenseKey: "dream_lk_OLD", domain: "app.acme.com" },
    );
    expect((await syncSite(deps)).status).toBe("registered");
    expect(calls.map((c) => c.url.slice(REGISTRY.length))).toEqual([
      "/sites/heartbeat",
      "/sites/challenge",
      "/sites/register",
    ]);
  });

  it("re-registers when the domain changed", async () => {
    const { deps, calls } = makeDeps(
      {},
      { licenseKey: KEY, domain: "old.acme.com" },
    );
    expect((await syncSite(deps)).status).toBe("registered");
    expect(calls[0]?.url).toBe(`${REGISTRY}/sites/challenge`);
  });

  it("is off with DREAM_TELEMETRY=off, on localhost, and without an owner", async () => {
    for (const [overrides, reason] of [
      [{ telemetry: false }, "opted_out"],
      [{ domain: null }, "no_public_domain"],
      [
        { people: () => Promise.resolve({ owner: null, staff: [] }) },
        "no_owner",
      ],
    ] as const) {
      const { deps, calls } = makeDeps(overrides);
      expect(await syncSite(deps, { force: true })).toEqual({
        status: "skipped",
        reason,
      });
      expect(calls).toHaveLength(0);
    }
  });

  it("throttles unless forced", async () => {
    const recent = new Date(NOW - DAY_MS / 4).toISOString();
    const { deps, calls } = makeDeps({}, { lastAttemptAt: recent });
    expect(await syncSite(deps)).toEqual({
      status: "skipped",
      reason: "throttled",
    });
    expect(calls).toHaveLength(0);
    expect((await syncSite(deps, { force: true })).status).toBe("registered");
  });

  it("never throws: registry errors land in lastError (without the key)", async () => {
    const { deps, state } = makeDeps({
      replies: {
        "/sites/register": {
          status: 503,
          body: { code: "registry_not_ready", error: "not set up" },
        },
      },
    } as never);
    const result = await syncSite(deps, { force: true });
    expect(result).toEqual({
      status: "error",
      message: "registry_not_ready: not set up",
    });
    expect(state()).toMatchObject({
      nonce: null,
      lastError: "registry_not_ready: not set up",
    });
    expect(state().licenseKey).toBeUndefined();
  });

  it("reports an unreachable registry", async () => {
    const { deps, state } = makeDeps({
      fetchImpl: (() =>
        Promise.reject(new Error("ENOTFOUND"))) as unknown as typeof fetch,
    });
    const result = await syncSite(deps, { force: true });
    expect(result.status).toBe("error");
    expect(state().lastError).toContain("registry unreachable");
  });
});

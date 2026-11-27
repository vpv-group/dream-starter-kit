import { describe, expect, it, vi } from "vitest";

import {
  connectorDisconnect,
  connectorStartUrl,
  connectorToken,
  connectorTokenCache,
} from "./connectors-core";

const REGISTRY = "https://www.meetdream.com/api/mod/modules/v1";

function fake(status: number, body: unknown) {
  return vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve(Response.json(body, { status })),
  );
}

const opts = (fetchImpl: ReturnType<typeof fake>) => ({
  registry: REGISTRY,
  siteKey: "dsk_site",
  fetchImpl: fetchImpl as unknown as typeof fetch,
});

describe("Meet Dream connectors", () => {
  it("starts a connect flow with the return path and mode, signed by the site key", async () => {
    const fetcher = fake(200, { url: "https://www.meetdream.com/oauth/x" });
    const res = await connectorStartUrl(
      opts(fetcher),
      "stripe",
      "https://app.example.com/admin/collections/kit-modules/3",
      "test",
    );
    expect(res).toEqual({
      status: "ok",
      url: "https://www.meetdream.com/oauth/x",
    });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe(`${REGISTRY}/connect/stripe/start`);
    expect(init?.method).toBe("POST");
    expect(
      (init?.headers as Record<string, string>)["X-Dream-License-Key"],
    ).toBe("dsk_site");
    expect(JSON.parse(init?.body as string)).toEqual({
      returnTo: "https://app.example.com/admin/collections/kit-modules/3",
      mode: "test",
    });
  });

  it("parses a connected account's token", async () => {
    const fetcher = fake(200, {
      accessToken: "rk_test_x",
      expiresAt: "2030-01-01T00:00:00.000Z",
      accountId: "acct_123",
      accountName: "Acme",
      livemode: false,
      publishableKey: "pk_test_x",
    });
    const res = await connectorToken(opts(fetcher), "stripe");
    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      expect(res.token.accountId).toBe("acct_123");
      expect(res.token.publishableKey).toBe("pk_test_x");
    }
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `${REGISTRY}/sites/connectors/stripe/token`,
    );
  });

  it("maps not_connected and malformed answers to calm states", async () => {
    expect(
      (
        await connectorToken(
          opts(fake(404, { code: "not_connected", message: "Not connected" })),
          "stripe",
        )
      ).status,
    ).toBe("not_connected");
    expect(
      (await connectorToken(opts(fake(200, { nope: true })), "stripe")).status,
    ).toBe("error");
    expect(
      (await connectorDisconnect(opts(fake(200, {})), "stripe")).status,
    ).toBe("ok");
  });

  it("caches tokens per target until 5 minutes before expiry", () => {
    let now = Date.parse("2030-01-01T00:00:00.000Z");
    const cache = connectorTokenCache(() => now);
    const token = {
      accessToken: "a",
      expiresAt: "2030-01-01T01:00:00.000Z",
      accountId: "acct_1",
    };
    cache.set("stripe", token);
    expect(cache.get("stripe")).toBe(token);
    expect(cache.get("github")).toBeNull();
    now += 56 * 60_000;
    expect(cache.get("stripe")).toBeNull();
    cache.set("stripe", { ...token, expiresAt: null });
    expect(cache.get("stripe")?.expiresAt).toBeNull();
    cache.clear("stripe");
    expect(cache.get("stripe")).toBeNull();
  });
});

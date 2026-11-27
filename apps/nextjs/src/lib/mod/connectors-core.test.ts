import { describe, expect, it, vi } from "vitest";

import {
  connectorDisconnect,
  connectorForward,
  connectorStartUrl,
  connectorStatus,
  connectorWebhookTarget,
  githubSyncAccess,
  githubSyncRevoke,
  githubSyncStart,
  githubSyncToken,
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

  it("parses the site's connection status", async () => {
    const fetcher = fake(200, {
      accountId: "acct_123",
      accountName: "Acme",
      livemode: false,
      publishableKey: "pk_test_platform",
      ready: false,
      onboardingUrl: "https://connect.stripe.com/setup/x",
    });
    const res = await connectorStatus(opts(fetcher), "stripe");
    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      expect(res.connection.accountId).toBe("acct_123");
      expect(res.connection.ready).toBe(false);
      expect(res.connection.onboardingUrl).toContain("connect.stripe.com");
    }
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `${REGISTRY}/sites/connectors/stripe/status`,
    );
  });

  it("maps not_connected and malformed answers to calm states", async () => {
    expect(
      (
        await connectorStatus(
          opts(fake(404, { code: "not_connected", message: "Not connected" })),
          "stripe",
        )
      ).status,
    ).toBe("not_connected");
    expect(
      (await connectorStatus(opts(fake(200, { nope: true })), "stripe")).status,
    ).toBe("error");
    expect(
      (await connectorDisconnect(opts(fake(200, {})), "stripe")).status,
    ).toBe("ok");
  });

  it("forwards a provider call with the site key, never a provider credential, and passes the answer through", async () => {
    const fetcher = fake(402, { error: { type: "card_error" } });
    const res = await connectorForward(
      opts(fetcher),
      "stripe",
      "/v1/products",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer sk_placeholder",
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": "idem_1",
        },
        body: "name=Pro",
      },
    );
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: { type: "card_error" } });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe(`${REGISTRY}/sites/connectors/stripe/api/v1/products`);
    const headers = init?.headers as Record<string, string>;
    expect(headers["X-Dream-License-Key"]).toBe("dsk_site");
    expect(headers.Authorization).toBeUndefined();
    expect(headers["Idempotency-Key"]).toBe("idem_1");
    expect(init?.body).toBe("name=Pro");
  });

  it("registers the site's webhook target and returns its signing secret", async () => {
    const fetcher = fake(200, { secret: "whsec_site" });
    const res = await connectorWebhookTarget(
      opts(fetcher),
      "stripe",
      "https://app.example.com/api/mod/billing-adapter-stripe/webhook",
    );
    expect(res).toEqual({ status: "ok", secret: "whsec_site" });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe(`${REGISTRY}/sites/connectors/stripe/webhook-target`);
    expect(JSON.parse(init?.body as string)).toEqual({
      url: "https://app.example.com/api/mod/billing-adapter-stripe/webhook",
    });
  });
});

describe("GitHub sync access", () => {
  it("starts a grant with the return URL and the forward route", async () => {
    const fetcher = fake(200, { url: "https://github.com/login/oauth/x" });
    const res = await githubSyncStart(
      opts(fetcher),
      "https://app.example.com/admin/collections/kit-modules/7",
      "/api/mod/projects-adapter-github/webhook",
    );
    expect(res).toEqual({
      status: "ok",
      url: "https://github.com/login/oauth/x",
    });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe(`${REGISTRY}/connect/github/sync/start`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      returnTo: "https://app.example.com/admin/collections/kit-modules/7",
      forwardPath: "/api/mod/projects-adapter-github/webhook",
    });
  });

  it("lists granted repositories and the forwarding secret", async () => {
    const fetcher = fake(200, {
      repos: [{ repo: "acme/web", repoId: "11", installationId: "5" }],
      forwardPath: "/api/mod/projects-adapter-github/webhook",
      forwardSecret: "s3cret",
    });
    const res = await githubSyncAccess(opts(fetcher));
    expect(res).toEqual({
      status: "ok",
      repos: [{ repo: "acme/web", repoId: "11", installationId: "5" }],
      forwardPath: "/api/mod/projects-adapter-github/webhook",
      forwardSecret: "s3cret",
    });
    expect(fetcher.mock.calls[0]?.[0]).toBe(`${REGISTRY}/sites/github/sync`);
  });

  it("mints a token for one repository", async () => {
    const fetcher = fake(200, {
      token: "ghs_x",
      expiresAt: "2030-01-01T00:00:00.000Z",
      repo: "acme/web",
      permissions: { issues: "write", metadata: "read" },
    });
    const res = await githubSyncToken(opts(fetcher), "acme/web");
    expect(res.status).toBe("ok");
    if (res.status === "ok") expect(res.token.token).toBe("ghs_x");
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe(`${REGISTRY}/sites/github/sync-token`);
    expect(JSON.parse(init?.body as string)).toEqual({ repo: "acme/web" });
  });

  it("reports an ungranted repository as not connected", async () => {
    const fetcher = fake(403, {
      code: "not_granted",
      message: "This repository isn't granted to the site",
    });
    const res = await githubSyncToken(opts(fetcher), "acme/other");
    expect(res).toEqual({
      status: "not_connected",
      message: "This repository isn't granted to the site",
    });
  });

  it("revokes a grant with DELETE", async () => {
    const fetcher = fake(200, { ok: true, revoked: true });
    const res = await githubSyncRevoke(opts(fetcher), "acme/web");
    expect(res).toEqual({ status: "ok", revoked: true });
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("DELETE");
  });

  it("rejects a malformed answer", async () => {
    const fetcher = fake(200, { repos: "nope" });
    const res = await githubSyncAccess(opts(fetcher));
    expect(res.status).toBe("error");
  });
});

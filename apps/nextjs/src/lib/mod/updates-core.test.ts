import { describe, expect, it, vi } from "vitest";

import {
  connectUrl,
  fetchSiteToken,
  fetchUpdates,
  saveSettings,
  tokenCache,
} from "./updates-core";

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

describe("Dream Updates client", () => {
  it("reads the connection and settings with the site key", async () => {
    const fetcher = fake(200, {
      connections: { source: { provider: "github", repo: "acme/app" } },
      settings: { autoUpdate: true, autoMerge: false, paused: [], skipped: [] },
      hold: null,
      brokerConfigured: true,
    });
    expect(await fetchUpdates(opts(fetcher))).toEqual({
      status: "ok",
      connected: true,
      repo: "acme/app",
      settings: {
        autoUpdate: true,
        autoMerge: false,
        paused: [],
        skipped: [],
        pausedReason: null,
      },
      hold: null,
      brokerConfigured: true,
      backendConfigured: false,
      canConfigureBackend: false,
    });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe(`${REGISTRY}/sites/updates`);
    expect(init?.headers).toEqual({ "X-Dream-License-Key": "dsk_site" });
  });

  it("reports not connected and registry refusals calmly", async () => {
    const none = await fetchUpdates(
      opts(
        fake(200, {
          connections: { source: null },
          settings: {},
        }),
      ),
    );
    expect(none).toMatchObject({ status: "ok", connected: false, repo: null });
    expect(
      await fetchSiteToken(
        opts(
          fake(409, { code: "not_connected", message: "Connect GitHub first" }),
        ),
      ),
    ).toEqual({
      status: "refused",
      code: "not_connected",
      message: "Connect GitHub first",
    });
  });

  it("says when Meet Dream can't be reached", async () => {
    const down: typeof fetch = () => Promise.reject(new Error("ECONNREFUSED"));
    expect(
      await fetchUpdates({
        registry: REGISTRY,
        siteKey: "k",
        fetchImpl: down,
      }),
    ).toMatchObject({ status: "unreachable" });
  });

  it("saves settings and passes resume through", async () => {
    const fetcher = fake(200, {
      settings: { autoUpdate: true, autoMerge: true, paused: [], skipped: [] },
    });
    const res = await saveSettings(opts(fetcher), {
      autoUpdate: true,
      autoMerge: true,
      paused: [],
      skipped: [],
      resume: true,
    });
    expect(res.status).toBe("ok");
    const [, init] = fetcher.mock.calls[0] ?? [];
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(init?.body as string)).toMatchObject({ resume: true });
  });

  it("gets the install URL for Connect GitHub", async () => {
    expect(
      await connectUrl(
        opts(
          fake(200, {
            url: "https://github.com/apps/dream-updates/installations/new?state=s",
          }),
        ),
        "github",
        "https://app.acme.com/admin/updates",
      ),
    ).toEqual({
      status: "ok",
      url: "https://github.com/apps/dream-updates/installations/new?state=s",
    });
  });
});

describe("tokenCache", () => {
  it("serves a token until 5 minutes before it expires", () => {
    let now = Date.parse("2026-12-01T10:00:00Z");
    const cache = tokenCache(() => now);
    cache.set({ token: "t", expiresAt: "2026-12-01T11:00:00Z", repo: "a/b" });
    expect(cache.get()?.token).toBe("t");
    now = Date.parse("2026-12-01T10:56:00Z");
    expect(cache.get()).toBeNull();
  });
});

describe("Connect Supabase", () => {
  it("names the site's Supabase project", async () => {
    const fetcher = fake(200, {
      url: "https://api.supabase.com/v1/oauth/authorize?x",
    });
    await connectUrl(
      opts(fetcher),
      "supabase",
      "https://app.acme.com/cms-setup/services",
      "https://abcdefghijklmnopqrst.supabase.co",
    );
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe(`${REGISTRY}/connect/backend/supabase/start`);
    expect(JSON.parse(init?.body as string)).toEqual({
      returnTo: "https://app.acme.com/cms-setup/services",
      supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
    });
  });
});

import { describe, expect, it, vi } from "vitest";

import {
  actionsOidcToken,
  authHeaders,
  registryAudience,
  requireRegistryAuth,
  resolveRegistryAuth,
} from "./registry-auth";

const REGISTRY = "https://www.meetdream.com/api/mod/modules/v1";
const ACTIONS = {
  ACTIONS_ID_TOKEN_REQUEST_URL: "https://token.actions.example/x?api-version=2",
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: "req-token",
};

const oidcFetch = () =>
  vi.fn((_url: URL | string, _init?: RequestInit) =>
    Promise.resolve(Response.json({ value: "jwt-1" })),
  );

describe("registry auth", () => {
  it("uses the registry's origin as the OIDC audience", () => {
    expect(registryAudience(REGISTRY)).toBe("https://www.meetdream.com");
  });

  it("signs in with the job's OIDC token inside Actions", async () => {
    const fetcher = oidcFetch();
    const auth = await resolveRegistryAuth(
      REGISTRY,
      { ...ACTIONS, DREAM_TOKEN: "ignored" },
      fetcher as unknown as typeof fetch,
    );
    expect(auth).toEqual({ kind: "oidc", token: "jwt-1" });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://token.actions.example/x?api-version=2&audience=https%3A%2F%2Fwww.meetdream.com",
    );
    expect(init?.headers).toEqual({ Authorization: "Bearer req-token" });
    expect(authHeaders({ kind: "oidc", token: "jwt-1" })).toEqual({
      Authorization: "Bearer jwt-1",
    });
  });

  it("falls back to DREAM_TOKEN elsewhere, sent as the license key header", async () => {
    const auth = await resolveRegistryAuth(REGISTRY, { DREAM_TOKEN: " k " });
    expect(auth).toEqual({ kind: "key", key: "k" });
    expect(authHeaders({ kind: "key", key: "k" })).toEqual({
      "X-Dream-License-Key": "k",
    });
  });

  it("explains how to sign in when nothing is set", async () => {
    expect(await resolveRegistryAuth(REGISTRY, {})).toBeNull();
    await expect(requireRegistryAuth(REGISTRY, {})).rejects.toThrow(
      /DREAM_TOKEN/,
    );
  });

  it("fails loudly when GitHub refuses the OIDC token", async () => {
    const refused = () => Promise.resolve(new Response("no", { status: 403 }));
    await expect(
      actionsOidcToken(
        "https://www.meetdream.com",
        ACTIONS,
        refused as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/id-token: write/);
    expect(await actionsOidcToken("aud", {})).toBeNull();
  });
});

import { describe, expect, it, vi } from "vitest";

import { legacyMeta, parsePrMeta, prMarker } from "./pr-meta";
import { openSession, sessionOutputs } from "./session";

const REGISTRY = "https://www.meetdream.com/api/mod/modules/v1";
const ACTIONS = {
  ACTIONS_ID_TOKEN_REQUEST_URL: "https://token.actions.example/x?v=1",
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: "req",
};

function registryFetch(status: number, body: unknown) {
  return vi.fn((url: URL | string) =>
    Promise.resolve(
      String(url).startsWith("https://token.actions.example")
        ? Response.json({ value: "jwt" })
        : Response.json(body, { status }),
    ),
  );
}

const SESSION = {
  githubToken: "ghs_abc",
  expiresAt: "2030-01-01T00:00:00Z",
  repo: "acme/app",
  settings: {
    autoUpdate: true,
    autoMerge: true,
    paused: ["crm"],
    skipped: [],
    pausedReason: null,
  },
  hold: null,
  releaseHolds: [],
  site: { canary: false },
};

describe("openSession", () => {
  it("trades the OIDC token for a repo token and settings", async () => {
    const fetcher = registryFetch(200, SESSION);
    const result = await openSession(
      REGISTRY,
      ACTIONS,
      fetcher as unknown as typeof fetch,
    );
    expect(result).toEqual({ status: "ok", session: SESSION });
    const call = fetcher.mock.calls[1] as unknown as [string, RequestInit];
    expect(call[0]).toBe(`${REGISTRY}/ops/session`);
    expect(call[1].headers).toEqual({ Authorization: "Bearer jwt" });
  });

  it("turns 'not connected' into a calm notice", async () => {
    const result = await openSession(
      REGISTRY,
      ACTIONS,
      registryFetch(409, {
        code: "not_connected",
        message: "This repository isn't connected to a Dream site",
      }) as unknown as typeof fetch,
    );
    expect(result.status).toBe("not-connected");
    expect(sessionOutputs(result)).toEqual({
      log: expect.stringMatching(
        /^::notice title=Automatic updates are off::/,
      ) as string,
      output: expect.stringMatching(/^connected=false\n/) as string,
    });
  });

  it("does nothing outside GitHub Actions", async () => {
    expect((await openSession(REGISTRY, {})).status).toBe("unavailable");
  });
});

describe("sessionOutputs", () => {
  it("masks the token before writing it, and folds a pause into auto_merge", () => {
    const { log, output } = sessionOutputs({
      status: "ok",
      session: {
        ...SESSION,
        settings: { ...SESSION.settings, pausedReason: "deploy failed" },
      },
    });
    expect(log).toBe("::add-mask::ghs_abc\n");
    expect(output).toContain("token=ghs_abc\n");
    expect(output).toContain("auto_merge=false\n");
    expect(output).toContain("paused=crm\n");
  });
});

describe("PR marker", () => {
  it("round-trips through a PR body", () => {
    const meta = {
      kind: "module" as const,
      op: "update" as const,
      slug: "crm",
      from: "1.0.0",
      to: "1.1.0",
      verified: true,
    };
    expect(parsePrMeta(`Hello\n\n${prMarker(meta)}\n`)).toEqual(meta);
    expect(parsePrMeta("no marker")).toBeNull();
    expect(parsePrMeta('<!-- dream-update {"kind":"evil"} -->')).toBeNull();
  });

  it("recognizes the old workflow's branches, unverified", () => {
    expect(legacyMeta("sync/upstream-2026-11-01")).toMatchObject({
      kind: "kit",
      verified: false,
    });
    expect(legacyMeta("mod/update-crm-998877")).toMatchObject({
      slug: "crm",
      op: "update",
    });
    expect(legacyMeta("mod/add-new-1")).toBeNull();
    expect(legacyMeta("feature/x")).toBeNull();
  });
});

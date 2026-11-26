import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { ModulesLock } from "./lock";
import { readLock, writeLock } from "./lock";
import {
  downloadVerified,
  fetchEntitlements,
  isDreamSource,
  latestCompatible,
  parseDreamSource,
  REGISTRY_ERROR_MESSAGES,
  RegistryError,
  registryUrl,
  requestDownload,
  sha256Hex,
} from "./registry";

/* ----------------------------- local fetch stub ----------------------------- */

type Handler = (url: string, init?: RequestInit) => Response;

/** A local fetch stub — no sockets, each test declares its responses. */
const stubFetch =
  (handler: Handler): typeof fetch =>
  (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    return Promise.resolve(handler(url, init));
  };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const REGISTRY = "https://registry.test/api/ext/modules/v1";
const GRANT = {
  slug: "crm",
  version: "1.2.0",
  url: "https://cdn.test/crm-1.2.0.zip",
  sha256: "a".repeat(64),
  expiresInSeconds: 300,
};

/* ------------------------------ source parsing ------------------------------ */

describe("parseDreamSource", () => {
  it("parses dream:<slug>", () => {
    expect(parseDreamSource("dream:crm")).toEqual({ slug: "crm" });
  });

  it("parses dream:<slug>@x.y.z (with or without a v)", () => {
    expect(parseDreamSource("dream:crm@1.2.3")).toEqual({
      slug: "crm",
      version: "1.2.3",
    });
    expect(parseDreamSource("dream:my-crm@v2.0.0")).toEqual({
      slug: "my-crm",
      version: "2.0.0",
    });
  });

  it("rejects bad slugs and partial versions", () => {
    for (const bad of ["dream:CRM", "dream:", "dream:crm@1.2", "dream:1crm"]) {
      expect(() => parseDreamSource(bad)).toThrow(/unparseable/);
    }
  });

  it("isDreamSource only matches the dream: prefix", () => {
    expect(isDreamSource("dream:crm")).toBe(true);
    expect(isDreamSource("https://github.com/x/y")).toBe(false);
    expect(isDreamSource("module.zip")).toBe(false);
  });
});

describe("env helpers", () => {
  it("registryUrl defaults to the Dream registry and strips trailing slashes", () => {
    expect(registryUrl({})).toBe(
      "https://www.meetdream.com/api/mod/modules/v1",
    );
    expect(registryUrl({ DREAM_REGISTRY_URL: `${REGISTRY}/` })).toBe(REGISTRY);
  });
});

/* ----------------------------- lock round-trip ----------------------------- */

describe("registry lock source", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("round-trips a registry source through modules.lock", () => {
    const root = mkdtempSync(path.join(tmpdir(), "mod-lock-test-"));
    dirs.push(root);
    const lock: ModulesLock = {
      lockVersion: 1,
      modules: {
        crm: {
          version: "1.2.0",
          kitCompat: ">=2.0.0 <3",
          source: {
            type: "registry",
            registry: REGISTRY,
            slug: "crm",
            version: "1.2.0",
            sha256: "a".repeat(64),
          },
          installedVia: "cli",
          stubs: [],
          edgeFunctions: [],
        },
      },
      tombstones: {},
    };
    writeLock(root, lock);
    expect(readLock(root)).toEqual(lock);
  });
});

/* -------------------------------- /download -------------------------------- */

describe("requestDownload", () => {
  const request = (handler: Handler) =>
    requestDownload(
      {
        registry: REGISTRY,
        auth: { kind: "key", key: "key-1" },
        slug: "crm",
        kitVersion: "2.0.0",
        repo: "acme/app",
      },
      stubFetch(handler),
    );

  it("POSTs the spec body with the key in X-Dream-License-Key", async () => {
    let seenUrl = "";
    let seenInit: RequestInit | undefined;
    const grant = await request((url, init) => {
      seenUrl = url;
      seenInit = init;
      return json(200, GRANT);
    });
    expect(grant).toEqual(GRANT);
    expect(seenUrl).toBe(`${REGISTRY}/download`);
    expect(seenInit?.method).toBe("POST");
    expect(
      (seenInit?.headers as Record<string, string>)["X-Dream-License-Key"],
    ).toBe("key-1");
    expect(JSON.parse(seenInit?.body as string)).toEqual({
      slug: "crm",
      kitVersion: "2.0.0",
      repo: "acme/app",
    });
  });

  it.each(Object.keys(REGISTRY_ERROR_MESSAGES))(
    'maps the "%s" error code to a RegistryError with an actionable message',
    async (code) => {
      const promise = request(() => json(403, { error: code }));
      await expect(promise).rejects.toBeInstanceOf(RegistryError);
      await expect(promise).rejects.toMatchObject({
        code,
        message: REGISTRY_ERROR_MESSAGES[code],
      });
    },
  );

  it("license-inactive codes read as a paused state, not a crash", async () => {
    for (const code of ["revoked_key", "not_entitled"]) {
      await expect(request(() => json(403, { error: code }))).rejects.toThrow(
        /license inactive — updates paused/,
      );
    }
  });

  it("falls back to an HTTP error for unknown bodies", async () => {
    await expect(request(() => json(500, "nope"))).rejects.toThrow(/HTTP 500/);
  });

  it("rejects an incomplete grant", async () => {
    await expect(
      request(() => json(200, { slug: "crm", version: "1.2.0" })),
    ).rejects.toThrow(/incomplete download grant/);
  });
});

/* --------------------------- verified zip download --------------------------- */

describe("downloadVerified", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const dest = () => {
    const dir = mkdtempSync(path.join(tmpdir(), "mod-dl-test-"));
    dirs.push(dir);
    return path.join(dir, "mod.zip");
  };
  const bytes = new TextEncoder().encode("zip bytes");

  it("writes the file when the sha256 matches", async () => {
    const file = dest();
    await downloadVerified(
      "https://cdn.test/mod.zip",
      sha256Hex(bytes),
      file,
      stubFetch(() => new Response(bytes)),
    );
    expect(existsSync(file)).toBe(true);
  });

  it("aborts on a sha256 mismatch, leaving nothing on disk", async () => {
    const file = dest();
    await expect(
      downloadVerified(
        "https://cdn.test/mod.zip",
        "b".repeat(64),
        file,
        stubFetch(() => new Response(bytes)),
      ),
    ).rejects.toThrow(/sha256 mismatch .* install aborted/);
    expect(existsSync(file)).toBe(false);
  });

  it("explains an expired signed URL", async () => {
    await expect(
      downloadVerified(
        "https://cdn.test/mod.zip",
        "b".repeat(64),
        dest(),
        stubFetch(() => new Response("gone", { status: 403 })),
      ),
    ).rejects.toThrow(/expires in minutes/);
  });
});

/* ------------------------------- entitlements ------------------------------- */

describe("fetchEntitlements", () => {
  const opts = {
    registry: REGISTRY,
    auth: { kind: "key", key: "key-1" } as const,
  };

  it("normalizes slugs given as strings or objects", async () => {
    const result = await fetchEntitlements(
      opts,
      stubFetch(() =>
        json(200, { entitlements: ["crm", { slug: "ai", plan: "Pro" }] }),
      ),
    );
    expect(result).toEqual({
      status: "active",
      entitlements: [{ slug: "crm" }, { slug: "ai", plan: "Pro" }],
    });
  });

  it("drops modules the registry lists as not entitled", async () => {
    const result = await fetchEntitlements(
      opts,
      stubFetch(() =>
        json(200, {
          account: { email: "a@b.test" },
          modules: [
            { slug: "crm", name: "CRM", entitled: true },
            { slug: "ai", name: "AI", entitled: false },
          ],
        }),
      ),
    );
    expect(result).toEqual({
      status: "active",
      entitlements: [{ slug: "crm" }],
    });
  });

  it("turns registry error codes into an inactive state", async () => {
    expect(
      await fetchEntitlements(
        opts,
        stubFetch(() => json(401, { error: "revoked_key" })),
      ),
    ).toEqual({ status: "inactive", code: "revoked_key" });
  });

  it("turns network failures into an error state (never throws)", async () => {
    const failing = (() =>
      Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch;
    expect(await fetchEntitlements(opts, failing)).toEqual({
      status: "error",
      message: "ECONNREFUSED",
    });
  });
});

/* --------------------------------- catalog --------------------------------- */

describe("latestCompatible", () => {
  it("returns the latest when kitCompat includes this kit", () => {
    expect(
      latestCompatible(
        { slug: "crm", latest: "1.2.0", kitCompat: ">=2.0.0 <3" },
        "2.0.0",
      ),
    ).toBe("1.2.0");
  });

  it("returns null for incompatible, invalid or missing entries", () => {
    expect(
      latestCompatible(
        { slug: "crm", latest: "9.0.0", kitCompat: ">=3" },
        "2.0.0",
      ),
    ).toBeNull();
    expect(latestCompatible({ slug: "crm", latest: "not-semver" })).toBeNull();
    expect(latestCompatible(undefined)).toBeNull();
  });
});

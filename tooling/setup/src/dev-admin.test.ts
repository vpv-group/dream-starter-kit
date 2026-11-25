import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { DEV_ADMIN_EMAIL, ensureDevAdmin } from "./dev-admin";

function fakeFetch(routes: Record<string, () => Response>) {
  const calls: { method: string; url: string; body?: string }[] = [];
  const impl = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body as string | undefined });
    const key = `${method} ${url.replace("http://api", "")}`;
    const route = Object.entries(routes).find(([k]) => key.startsWith(k));
    return Promise.resolve(
      route ? route[1]() : new Response("", { status: 404 }),
    );
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("ensureDevAdmin", () => {
  it("creates a confirmed staff user and saves the credentials", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "dev-admin-"));
    const { impl, calls } = fakeFetch({
      "POST /auth/v1/admin/users": () => json({ id: "u1" }),
      "PATCH /rest/v1/profiles?id=eq.u1": () =>
        new Response(null, { status: 204 }),
    });
    const creds = await ensureDevAdmin({
      apiUrl: "http://api",
      serviceRoleKey: "srk",
      root,
      fetchImpl: impl,
      log: () => undefined,
    });
    expect(creds.email).toBe(DEV_ADMIN_EMAIL);
    expect(JSON.parse(calls[0]?.body ?? "{}")).toMatchObject({
      email: DEV_ADMIN_EMAIL,
      email_confirm: true,
    });
    expect(JSON.parse(calls[1]?.body ?? "{}")).toEqual({ is_staff: true });
    const saved = JSON.parse(
      readFileSync(path.join(root, ".dream", "dev-admin.json"), "utf8"),
    ) as { password: string };
    expect(saved.password).toBe(creds.password);
  });

  it("reuses saved credentials and resets the password when the user exists", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "dev-admin-"));
    mkdirSync(path.join(root, ".dream"));
    writeFileSync(
      path.join(root, ".dream", "dev-admin.json"),
      JSON.stringify({ email: DEV_ADMIN_EMAIL, password: "kept" }),
    );
    const { impl, calls } = fakeFetch({
      "POST /auth/v1/admin/users": () => json({ msg: "exists" }, 422),
      "GET /auth/v1/admin/users": () =>
        json({ users: [{ id: "u9", email: DEV_ADMIN_EMAIL }] }),
      "PUT /auth/v1/admin/users/u9": () => json({ id: "u9" }),
      "PATCH /rest/v1/profiles?id=eq.u9": () =>
        new Response(null, { status: 204 }),
    });
    const creds = await ensureDevAdmin({
      apiUrl: "http://api",
      serviceRoleKey: "srk",
      root,
      fetchImpl: impl,
      log: () => undefined,
    });
    expect(creds.password).toBe("kept");
    expect(calls.map((c) => c.method)).toEqual(["POST", "GET", "PUT", "PATCH"]);
    expect(JSON.parse(calls[2]?.body ?? "{}")).toMatchObject({
      password: "kept",
    });
  });

  it("fails loudly on other errors", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "dev-admin-"));
    const { impl } = fakeFetch({
      "POST /auth/v1/admin/users": () => new Response("down", { status: 500 }),
    });
    await expect(
      ensureDevAdmin({
        apiUrl: "http://api",
        serviceRoleKey: "srk",
        root,
        fetchImpl: impl,
        log: () => undefined,
      }),
    ).rejects.toThrow(/HTTP 500/);
  });
});

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  latestRelease,
  packageName,
  parseArgs,
  planCreate,
  renamePackage,
  titleFromDir,
} from "./plan";

const base = {
  dir: "my-app",
  name: "My App",
  kitUrl: "https://example.com/kit.git",
  tag: "v2.4.0",
  modules: [],
  github: false,
  setup: true,
};

describe("parseArgs", () => {
  it("reads the directory and options", () => {
    expect(
      parseArgs(["acme-portal", "--modules", "crm, client-portal", "--github"]),
    ).toEqual({
      ok: true,
      options: expect.objectContaining({
        dir: "acme-portal",
        name: "Acme Portal",
        modules: ["crm", "client-portal"],
        github: true,
        setup: true,
      }) as object,
    });
    expect(parseArgs(["x", "--kit", "/tmp/kit.git"])).toMatchObject({
      options: { kitUrl: "/tmp/kit.git" },
    });
    expect(parseArgs(["x", "--name", "Shop", "--no-setup"])).toMatchObject({
      ok: true,
      options: { name: "Shop", setup: false },
    });
  });

  it("explains what's wrong", () => {
    expect(parseArgs([])).toMatchObject({ ok: false });
    expect(parseArgs(["a", "--modules", "Bad Slug"])).toMatchObject({
      ok: false,
      error: '"Bad Slug" isn\'t a module slug.',
    });
    expect(parseArgs(["a", "--tag", "main"])).toMatchObject({ ok: false });
    expect(parseArgs(["a", "--wat"])).toMatchObject({ ok: false });
  });
});

describe("names", () => {
  it("derives a title and a package name", () => {
    expect(titleFromDir("./apps/my_cool-app")).toBe("My Cool App");
    expect(packageName("Café Délice!")).toBe("caf-d-lice");
    expect(packageName("!!!")).toBe("dream-app");
    expect(
      renamePackage('{"name":"dream-starter-kit","version":"2.4.0"}', "My App"),
    ).toBe('{\n  "name": "my-app",\n  "version": "2.4.0"\n}\n');
  });
});

describe("latestRelease", () => {
  it("picks the newest stable tag", () => {
    const out = [
      "a\trefs/tags/v2.3.0",
      "b\trefs/tags/v2.10.0",
      "c\trefs/tags/v2.10.0^{}",
      "d\trefs/tags/v3.0.0-rc.1",
      "e\trefs/tags/junk",
    ].join("\n");
    expect(latestRelease(out)).toBe("v2.10.0");
    expect(latestRelease("")).toBeNull();
  });
});

describe("planCreate", () => {
  it("clones the release with history and keeps the kit as upstream", () => {
    expect(planCreate(base).map((s) => [s.cmd, ...s.args].join(" "))).toEqual([
      "git clone --quiet --branch v2.4.0 https://example.com/kit.git my-app",
      "git checkout --quiet -b main",
      "git remote rename origin upstream",
      "pnpm dev:setup",
    ]);
  });

  it("adds GitHub and modules after setup", () => {
    const steps = planCreate({ ...base, github: true, modules: ["crm"] });
    expect(
      steps.map((s) => s.cmd + " " + s.args.slice(0, 3).join(" ")),
    ).toEqual([
      "git clone --quiet --branch",
      "git checkout --quiet -b",
      "git remote rename origin",
      "gh repo create my-app",
      "pnpm dev:setup",
      "pnpm mod add dream:crm",
    ]);
    expect(steps.find((s) => s.cmd === "gh")?.optional).toBe(true);
  });

  it("installs modules without applying them when setup is skipped", () => {
    const steps = planCreate({ ...base, setup: false, modules: ["crm"] });
    expect(steps.slice(3).map((s) => s.args.join(" "))).toEqual([
      "install",
      "mod add dream:crm --no-apply",
    ]);
  });
});

describe("the clone keeps the kit's history (real git)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("makes the kit release an ancestor of main", () => {
    const work = mkdtempSync(path.join(tmpdir(), "create-dream-app-"));
    dirs.push(work);
    const kit = path.join(work, "kit");
    const g = (cwd: string, ...args: string[]) =>
      execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
    execFileSync("git", ["init", "-q", "-b", "main", kit]);
    g(kit, "config", "user.email", "t@t");
    g(kit, "config", "user.name", "t");
    writeFileSync(path.join(kit, "package.json"), '{"name":"kit"}\n');
    g(kit, "add", "-A");
    g(kit, "commit", "-qm", "kit");
    g(kit, "tag", "v2.4.0");

    const steps = planCreate({
      ...base,
      dir: "app",
      kitUrl: kit,
      setup: false,
    });
    for (const s of steps) {
      execFileSync(s.cmd, s.args, {
        cwd: s.cwd === "app" ? path.join(work, "app") : work,
      });
    }
    const app = path.join(work, "app");
    g(app, "merge-base", "--is-ancestor", "v2.4.0", "HEAD");
    expect(g(app, "remote")).toBe("upstream");
    expect(g(app, "branch", "--show-current")).toBe("main");
    expect(readFileSync(path.join(app, "package.json"), "utf8")).toContain(
      "kit",
    );
  });
});

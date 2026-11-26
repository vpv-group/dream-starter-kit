import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { git } from "../git";
import { applyBaseline, baselineOutput, planBaseline } from "./baseline";
import { planKitUpdate } from "./kit-update";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function repo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "baseline-test-"));
  dirs.push(dir);
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "test"]);
  return dir;
}

function write(dir: string, version: string, notes: string) {
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "kit", version }) + "\n",
  );
  writeFileSync(path.join(dir, "notes.txt"), notes);
}

function commit(dir: string, msg: string) {
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", msg]);
}

/** Kit v2.3.0 then v2.4.0 (which changes notes.txt). */
function kit(): string {
  const up = repo();
  write(up, "2.3.0", "kit 2.3.0\n");
  commit(up, "2.3.0");
  git(up, ["tag", "v2.3.0"]);
  write(up, "2.4.0", "kit 2.4.0\n");
  commit(up, "2.4.0");
  git(up, ["tag", "v2.4.0"]);
  return up;
}

/** A Vercel clone of 2.3.0: same files, no history, then customized. */
function vercelClone(): string {
  const app = repo();
  write(app, "2.3.0", "kit 2.3.0\n");
  writeFileSync(path.join(app, "mine.txt"), "my feature\n");
  commit(app, "Initial commit");
  return app;
}

describe("baseline", () => {
  it("records the matching release as an ancestor without changing files", () => {
    const up = kit();
    const app = vercelClone();
    const plan = planBaseline({ repoRoot: app, upstreamUrl: up });
    expect(plan).toMatchObject({ action: "merge", tag: "v2.3.0" });
    if (plan.action !== "merge") return;
    const treeBefore = git(app, ["rev-parse", "HEAD^{tree}"]);
    applyBaseline(app, plan);
    expect(git(app, ["rev-parse", "HEAD^{tree}"])).toBe(treeBefore);

    // The next kit update is a normal merge that only brings 2.3.0 → 2.4.0.
    const update = planKitUpdate({ repoRoot: app, upstreamUrl: up });
    expect(update).toMatchObject({ action: "merge", unrelated: false });
    git(app, ["merge", "-q", "--no-edit", "refs/remotes/upstream/release"]);
    expect(readFileSync(path.join(app, "notes.txt"), "utf8")).toBe(
      "kit 2.4.0\n",
    );
    expect(readFileSync(path.join(app, "mine.txt"), "utf8")).toBe(
      "my feature\n",
    );
  });

  it("does nothing once the history is shared", () => {
    const up = kit();
    const app = repo();
    git(app, ["pull", "-q", up, "v2.3.0"]);
    expect(planBaseline({ repoRoot: app, upstreamUrl: up })).toEqual({
      action: "not-needed",
    });
  });

  it("waits when the kit has no release for this version", () => {
    const up = kit();
    const app = repo();
    write(app, "2.3.5", "x\n");
    commit(app, "init");
    const plan = planBaseline({ repoRoot: app, upstreamUrl: up });
    expect(plan).toEqual({ action: "no-release", version: "2.3.5" });
    expect(baselineOutput(plan)).toBe("action=no-release\nversion=2.3.5\n");
  });
});

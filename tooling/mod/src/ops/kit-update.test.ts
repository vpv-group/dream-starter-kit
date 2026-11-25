import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { git } from "../git";
import {
  pickLatestRelease,
  planKitUpdate,
  RELEASE_REF,
  toGithubOutput,
} from "./kit-update";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function repo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "kit-update-test-"));
  dirs.push(dir);
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "test"]);
  return dir;
}

function commitVersion(dir: string, version: string, extra = ""): string {
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "kit", version }) + "\n",
  );
  writeFileSync(path.join(dir, "notes.txt"), `${version}${extra}\n`);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", `release ${version}${extra}`]);
  return git(dir, ["rev-parse", "HEAD"]);
}

/** Upstream kit: v2.3.0, v2.4.0, an rc, and unreleased work on main. */
function upstreamKit(): string {
  const up = repo();
  commitVersion(up, "2.3.0");
  git(up, ["tag", "v2.3.0"]);
  commitVersion(up, "2.4.0");
  git(up, ["tag", "-a", "v2.4.0", "-m", "2.4.0"]);
  commitVersion(up, "2.5.0-rc.1");
  git(up, ["tag", "v2.5.0-rc.1"]);
  commitVersion(up, "2.5.0", " (unreleased work on main)");
  return up;
}

describe("pickLatestRelease", () => {
  it("picks the newest stable vX.Y.Z and ignores pre-releases and junk", () => {
    expect(
      pickLatestRelease([
        "refs/tags/v2.3.0",
        "refs/tags/v2.10.0",
        "refs/tags/v2.10.0^{}",
        "refs/tags/v3.0.0-rc.1",
        "refs/tags/nightly",
        "refs/tags/2.11.0",
      ]),
    ).toBe("v2.10.0");
  });

  it("returns null when the kit has no release yet", () => {
    expect(pickLatestRelease([])).toBeNull();
    expect(pickLatestRelease(["refs/tags/v1.0.0-beta.1"])).toBeNull();
  });
});

describe("planKitUpdate", () => {
  it("offers the latest release, not main and not a pre-release", () => {
    const up = upstreamKit();
    const app = repo();
    git(app, ["pull", "-q", up, "v2.3.0"]);

    const plan = planKitUpdate({ repoRoot: app, upstreamUrl: up });
    expect(plan).toEqual({
      action: "merge",
      tag: "v2.4.0",
      latest: "2.4.0",
      current: "2.3.0",
      ref: RELEASE_REF,
      unrelated: false,
      publishedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as string,
    });
    // The fetched ref is the v2.4.0 commit, not main.
    expect(git(app, ["show", `${RELEASE_REF}:package.json`])).toContain(
      '"version":"2.4.0"',
    );
  });

  it("is up to date once the release is merged", () => {
    const up = upstreamKit();
    const app = repo();
    git(app, ["pull", "-q", up, "v2.3.0"]);
    writeFileSync(path.join(app, "mine.txt"), "my own change\n");
    git(app, ["add", "-A"]);
    git(app, ["commit", "-q", "-m", "my change"]);

    const first = planKitUpdate({ repoRoot: app, upstreamUrl: up });
    expect(first.action).toBe("merge");
    git(app, ["merge", "-q", "--no-edit", RELEASE_REF]);

    expect(planKitUpdate({ repoRoot: app, upstreamUrl: up })).toEqual({
      action: "up-to-date",
      tag: "v2.4.0",
      latest: "2.4.0",
      current: "2.4.0",
    });
  });

  it("flags a repo with no shared history (template or Vercel clone)", () => {
    const up = upstreamKit();
    const app = repo();
    commitVersion(app, "2.3.0", " copied without history");

    const plan = planKitUpdate({ repoRoot: app, upstreamUrl: up });
    expect(plan).toMatchObject({
      action: "merge",
      tag: "v2.4.0",
      unrelated: true,
    });
  });

  it("says when the kit has not published a release yet", () => {
    const up = repo();
    commitVersion(up, "2.3.0");
    const app = repo();
    git(app, ["pull", "-q", up, "main"]);
    expect(planKitUpdate({ repoRoot: app, upstreamUrl: up })).toEqual({
      action: "no-release",
    });
  });
});

describe("toGithubOutput", () => {
  it("writes the workflow outputs", () => {
    expect(
      toGithubOutput({
        action: "merge",
        tag: "v2.4.0",
        latest: "2.4.0",
        current: "2.3.0",
        ref: RELEASE_REF,
        unrelated: false,
        publishedAt: "2026-11-20T10:00:00Z",
      }),
    ).toBe(
      `action=merge\ntag=v2.4.0\nlatest=2.4.0\ncurrent=2.3.0\nref=${RELEASE_REF}\nunrelated=false\npublished_at=2026-11-20T10:00:00Z\n`,
    );
    expect(toGithubOutput({ action: "no-release" })).toBe(
      "action=no-release\n",
    );
  });
});

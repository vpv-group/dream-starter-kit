import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  isGeneratedFile,
  resolveGeneratedConflicts,
  splitConflicts,
} from "./resolve-generated";

const git = (cwd: string, args: string[]) =>
  execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();

function write(root: string, file: string, text: string) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

describe("generated-file conflicts", () => {
  it("knows which files are regenerated", () => {
    expect(isGeneratedFile("pnpm-lock.yaml")).toBe(true);
    expect(isGeneratedFile("packages/cms/src/payload-types.ts")).toBe(true);
    expect(isGeneratedFile("apps/nextjs/src/mod/lock.generated.ts")).toBe(true);
    expect(isGeneratedFile("apps/nextjs/src/app/page.tsx")).toBe(false);
    expect(splitConflicts(["pnpm-lock.yaml", "README.md"])).toEqual({
      generated: ["pnpm-lock.yaml"],
      manual: ["README.md"],
    });
  });

  it("takes the release's side of generated files and leaves the rest", () => {
    const root = mkdtempSync(path.join(tmpdir(), "resolve-gen-"));
    git(root, ["init", "-q", "-b", "main"]);
    git(root, ["config", "user.email", "t@t"]);
    git(root, ["config", "user.name", "t"]);
    write(root, "pnpm-lock.yaml", "base\n");
    write(root, "README.md", "base\n");
    git(root, ["add", "-A"]);
    git(root, ["commit", "-qm", "base"]);
    git(root, ["checkout", "-qb", "release"]);
    write(root, "pnpm-lock.yaml", "release\n");
    write(root, "README.md", "release\n");
    git(root, ["commit", "-qam", "release"]);
    git(root, ["checkout", "-q", "main"]);
    write(root, "pnpm-lock.yaml", "mine\n");
    write(root, "README.md", "mine\n");
    git(root, ["commit", "-qam", "mine"]);
    expect(() => git(root, ["merge", "-q", "release"])).toThrow();

    expect(resolveGeneratedConflicts(root)).toEqual({
      resolved: ["pnpm-lock.yaml"],
      remaining: ["README.md"],
    });
    expect(readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8")).toBe(
      "release\n",
    );
    expect(readFileSync(path.join(root, "README.md"), "utf8")).toContain(
      "<<<<<<<",
    );
  });
});

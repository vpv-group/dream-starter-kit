import { describe, expect, it } from "vitest";

import type { GithubPr } from "./ops-core";
import { classifyOpsPr, dispatchBody, toOpsPrs } from "./ops-core";

const pr = (number: number, ref: string, labels: string[] = []): GithubPr => ({
  number,
  title: `PR ${number}`,
  html_url: `https://github.com/o/r/pull/${number}`,
  labels: labels.map((name) => ({ name })),
  head: { ref },
});

describe("classifyOpsPr", () => {
  it("recognizes kit update PRs by branch or label", () => {
    expect(classifyOpsPr(pr(1, "sync/upstream-2026-11-25"))).toBe("kit");
    expect(classifyOpsPr(pr(2, "renamed", ["kit-update"]))).toBe("kit");
    expect(classifyOpsPr(pr(3, "x", ["kit-update-conflicts"]))).toBe("kit");
  });

  it("recognizes module op PRs by branch or label", () => {
    expect(classifyOpsPr(pr(4, "mod/update-crm-123"))).toBe("module");
    expect(classifyOpsPr(pr(5, "x", ["module-op"]))).toBe("module");
  });

  it("ignores everyone else's PRs", () => {
    expect(classifyOpsPr(pr(6, "feature/login", ["bug"]))).toBeNull();
  });
});

describe("toOpsPrs", () => {
  it("lists kit PRs first and flags conflicts", () => {
    const out = toOpsPrs([
      pr(9, "mod/update-crm-1", ["module-op", "module-op-conflicts"]),
      pr(3, "feature/x"),
      pr(7, "sync/upstream-2026-11-25", ["kit-update"]),
    ]);
    expect(out.map((p) => [p.number, p.kind, p.conflicts])).toEqual([
      [7, "kit", false],
      [9, "module", true],
    ]);
    expect(out[0]?.url).toBe("https://github.com/o/r/pull/7");
  });
});

describe("dispatchBody", () => {
  it("targets the default branch, falling back to main", () => {
    expect(dispatchBody({ op: "update", slug: "crm" }, "trunk").ref).toBe(
      "trunk",
    );
    expect(dispatchBody({ op: "update", slug: "crm" }, null).ref).toBe("main");
  });

  it("maps module op inputs", () => {
    expect(
      dispatchBody({ op: "remove", slug: "crm", keepData: true }, "main")
        .inputs,
    ).toEqual({
      op: "remove",
      source: "",
      slug: "crm",
      version: "",
      keep_data: "true",
      sha256: "",
    });
  });

  it("sends kit-update with no module inputs", () => {
    expect(
      dispatchBody(
        { op: "kit-update", slug: "crm", source: "x", keepData: true },
        "main",
      ).inputs,
    ).toEqual({
      op: "kit-update",
      source: "",
      slug: "",
      version: "",
      keep_data: "false",
      sha256: "",
    });
  });
});

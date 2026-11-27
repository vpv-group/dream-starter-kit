import { describe, expect, it } from "vitest";

import type { GithubPr } from "./ops-core";
import {
  classifyOpsPr,
  dispatchBody,
  prTarget,
  runTarget,
  toOpsPrs,
} from "./ops-core";

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
    expect(classifyOpsPr(pr(10, "dream/kit-update-2026-12-01"))).toBe("kit");
  });

  it("recognizes module op PRs by branch or label", () => {
    expect(classifyOpsPr(pr(4, "mod/update-crm-123"))).toBe("module");
    expect(classifyOpsPr(pr(5, "x", ["module-op"]))).toBe("module");
    expect(classifyOpsPr(pr(11, "dream/update-crm-9"))).toBe("module");
    expect(classifyOpsPr(pr(12, "x", ["dream-update"]))).toBe("module");
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
    const flagged = toOpsPrs([
      pr(1, "dream/update-crm-1", ["dream-update", "dream-review"]),
      pr(2, "dream/add-ai-2", ["dream-update", "dream-approved"]),
    ]);
    expect(flagged.map((p) => [p.needsReview, p.approved])).toEqual([
      [true, false],
      [false, true],
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
      approved: "false",
      pr: "",
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
      approved: "false",
      pr: "",
    });
  });
});

describe("dispatchBody approval", () => {
  it("marks admin installs and updates approved, never removals or checks", () => {
    const approved = (op: Parameters<typeof dispatchBody>[0]["op"]) =>
      dispatchBody({ op, slug: "crm", approved: true }, "main").inputs.approved;
    expect(approved("add")).toBe("true");
    expect(approved("update")).toBe("true");
    expect(approved("remove")).toBe("false");
    expect(approved("merge")).toBe("false");
    expect(dispatchBody({ op: "check", slug: "x" }, "main").inputs.slug).toBe(
      "",
    );
  });
});

describe("prTarget", () => {
  it("reads the slug and version from the PR marker", () => {
    expect(
      prTarget(
        'Update.\n\n<!-- dream-update {"kind":"module","op":"update","slug":"crm","to":"1.3.0","verified":true} -->',
      ),
    ).toEqual({ slug: "crm", to: "1.3.0", also: [] });
    expect(prTarget(null)).toEqual({ slug: null, to: null, also: [] });
    expect(prTarget("<!-- dream-update {oops} -->")).toEqual({
      slug: null,
      to: null,
      also: [],
    });
    expect(
      prTarget(
        '<!-- dream-update {"kind":"module","op":"add","slug":"projects-adapter-github","to":"0.1.0","verified":true,"also":["projects"]} -->',
      ).also,
    ).toEqual(["projects"]);
  });

  it("passes the chosen PR to a merge dispatch", () => {
    expect(dispatchBody({ op: "merge", pr: 12 }, "main").inputs.pr).toBe("12");
  });
});

describe("runTarget", () => {
  it("reads the op and modules from a run-name", () => {
    expect(runTarget("Module ops · add dream:projects-adapter-github")).toEqual(
      { op: "add", slugs: ["projects-adapter-github"] },
    );
    expect(runTarget("Module ops · add dream:a dream:b@1.2.0")).toEqual({
      op: "add",
      slugs: ["a", "b"],
    });
    expect(runTarget("Module ops · update crm")).toEqual({
      op: "update",
      slugs: ["crm"],
    });
    expect(runTarget("Module ops · check")).toEqual({ op: "check", slugs: [] });
    expect(runTarget("Module ops")).toBeNull();
  });
});

describe("dispatchBody batches", () => {
  it("joins several add sources into one run", () => {
    expect(
      dispatchBody(
        {
          op: "add",
          sources: ["dream:a", "dream:b", "dream:a"],
          approved: true,
        },
        "main",
      ).inputs.source,
    ).toBe("dream:a dream:b");
  });
});

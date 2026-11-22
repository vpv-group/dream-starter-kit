import { describe, expect, it } from "vitest";

import { isPaidOp } from "./paid-ops";

const lock = {
  modules: {
    crm: { version: "1.0.0", source: { type: "registry", slug: "crm" } },
    reminders: { version: "1.0.0", source: "local" },
    blog: { version: "1.0.0", source: { type: "github", repo: "a/b" } },
  },
};

describe("isPaidOp", () => {
  it("treats installing a dream: source as paid", () => {
    expect(isPaidOp({ op: "add", source: "dream:crm" }, lock)).toBe(true);
    expect(
      isPaidOp({ op: "add", source: "https://github.com/a/b" }, lock),
    ).toBe(false);
  });

  it("treats updating a registry-installed module as paid", () => {
    expect(isPaidOp({ op: "update", slug: "crm" }, lock)).toBe(true);
    expect(isPaidOp({ op: "update", slug: "reminders" }, lock)).toBe(false);
    expect(isPaidOp({ op: "update", slug: "blog" }, lock)).toBe(false);
    expect(isPaidOp({ op: "update", slug: "unknown" }, lock)).toBe(false);
  });

  it("never blocks removing a module", () => {
    expect(isPaidOp({ op: "remove", slug: "crm" }, lock)).toBe(false);
  });
});

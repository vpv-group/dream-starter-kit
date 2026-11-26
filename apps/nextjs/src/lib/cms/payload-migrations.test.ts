import { describe, expect, it } from "vitest";

import { modPayloadMigrations } from "../../mod/registry.payload.generated";
import { migrations } from "../../payload/migrations";
import { mergePayloadMigrations } from "./payload-migrations";

const m = (name: string, tag = "") => ({ name, tag });

describe("mergePayloadMigrations", () => {
  it("keeps each name once (first list wins) and sorts by name", () => {
    const merged = mergePayloadMigrations(
      [m("20260612_b", "core"), m("20260609_a", "core")],
      [m("20260612_b", "module"), m("20260613_c", "module")],
    );
    expect(merged).toEqual([
      m("20260609_a", "core"),
      m("20260612_b", "core"),
      m("20260613_c", "module"),
    ]);
  });
});

describe("the boot migration list", () => {
  const merged = mergePayloadMigrations(migrations, modPayloadMigrations);
  const names = merged.map((x) => x.name);

  it("lists every core and module migration exactly once", () => {
    expect(new Set(names).size).toBe(names.length);
    for (const x of [...migrations, ...modPayloadMigrations]) {
      expect(names).toContain(x.name);
    }
  });

  it("is in timestamp order", () => {
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

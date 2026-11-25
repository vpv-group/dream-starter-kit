import { describe, expect, it } from "vitest";

import { mergePayloadMigrations } from "./merge-migrations";

describe("mergePayloadMigrations", () => {
  it("keeps one entry per name, preferring the first list", () => {
    const core = [
      { name: "20260612_023534_ext_billing", from: "core" },
      { name: "20260610_000000_init", from: "core" },
    ];
    const mods = [
      { name: "20260612_023534_ext_billing", from: "module" },
      { name: "20260613_000000_mod_only", from: "module" },
    ];

    const merged = mergePayloadMigrations(core, mods);

    expect(merged.map((m) => m.name)).toEqual([
      "20260610_000000_init",
      "20260612_023534_ext_billing",
      "20260613_000000_mod_only",
    ]);
    expect(
      merged.find((m) => m.name === "20260612_023534_ext_billing")?.from,
    ).toBe("core");
  });

  it("returns an empty list for no input", () => {
    expect(mergePayloadMigrations()).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import type { ModLockEntry } from "../lock";
import { describeModuleOp, describeOutput } from "./describe";
import { parsePrMeta } from "./pr-meta";

const entry = (
  version: string,
  source: ModLockEntry["source"],
): ModLockEntry => ({
  version,
  kitCompat: ">=2",
  source,
  stubs: [],
  edgeFunctions: [],
});
const registry = {
  type: "registry",
  registry: "https://www.meetdream.com/api/mod/modules/v1",
  slug: "crm",
} as unknown as ModLockEntry["source"];
const github = {
  type: "github",
  repo: "https://github.com/acme/mod-x",
} as unknown as ModLockEntry["source"];

describe("describeModuleOp", () => {
  it("finds the added module and marks registry installs verified", () => {
    const meta = describeModuleOp(
      "add",
      {},
      { crm: entry("1.0.0", registry) },
      "",
    );
    expect(meta).toEqual({
      kind: "module",
      op: "add",
      slug: "crm",
      to: "1.0.0",
      verified: true,
    });
  });

  it("records the version jump of an update; GitHub sources aren't verified", () => {
    expect(
      describeModuleOp(
        "update",
        { x: entry("1.0.0", github) },
        { x: entry("2.0.0", github) },
        "x",
      ),
    ).toEqual({
      kind: "module",
      op: "update",
      slug: "x",
      from: "1.0.0",
      to: "2.0.0",
      verified: false,
    });
  });

  it("describes a removal by what was installed", () => {
    expect(
      describeModuleOp("remove", { crm: entry("1.0.0", registry) }, {}, "crm"),
    ).toMatchObject({ op: "remove", from: "1.0.0", verified: true });
  });

  it("writes a marker the merge step can read back", () => {
    const meta = describeModuleOp("add", {}, { crm: entry("1.0.0", registry) });
    const out = describeOutput(meta);
    const marker = /^marker=(.*)$/m.exec(out)?.[1] ?? "";
    expect(parsePrMeta(marker)).toEqual(meta);
    expect(describeOutput(null)).toBe("marker=\nslug=\n");
  });
});

import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseSource } from "./lifecycle";

describe("parseSource", () => {
  it("resolves a relative zip against the directory pnpm was run in", () => {
    expect(parseSource("../crm-1.0.0.zip", "/work/kit")).toEqual({
      kind: "zip",
      location: path.resolve("/work/crm-1.0.0.zip"),
    });
  });

  it("keeps an absolute zip path", () => {
    expect(parseSource("/dl/crm.zip", "/work/kit").location).toBe(
      path.resolve("/dl/crm.zip"),
    );
  });

  it("splits a GitHub url and tag", () => {
    expect(
      parseSource("https://github.com/acme/mod-x#v1.2.0", "/work/kit"),
    ).toEqual({
      kind: "github",
      location: "https://github.com/acme/mod-x",
      ref: "v1.2.0",
    });
  });

  it("recognizes the Dream registry", () => {
    expect(parseSource("dream:crm", "/work/kit").kind).toBe("registry");
  });

  it("treats a bare slug as the Dream registry", () => {
    expect(parseSource("crm", "/work/kit")).toEqual({
      kind: "registry",
      location: "dream:crm",
    });
    expect(parseSource("client-portal@1.2.0", "/work/kit").location).toBe(
      "dream:client-portal@1.2.0",
    );
    expect(parseSource("crm.zip", "/work/kit").kind).toBe("zip");
  });
});

import { describe, expect, it } from "vitest";

import { nativeDependencies } from "./manifests";

const host = {
  expo: "~58.0.23",
  "expo-router": "~58.0.30",
  "react-native": "0.88.1",
};

describe("nativeDependencies", () => {
  it("keeps packages the app doesn't provide, skips JS-only ones", () => {
    const r = nativeDependencies(
      "projects",
      {
        "expo-image-picker": "~58.0.4",
        "expo-router": "~58.0.30",
        "date-fns": "^4.0.0",
        "@acme/ui-native": "workspace:*",
      },
      host,
    );
    expect(r.errors).toEqual([]);
    expect(r.packages).toEqual({ "expo-image-picker": "~58.0.4" });
  });

  it("rejects an expo package from another SDK", () => {
    const r = nativeDependencies("x", { "expo-location": "~57.0.1" }, host);
    expect(r.errors[0]).toMatch(/SDK 57.*SDK 58/);
  });

  it("rejects a range that conflicts with the app's copy", () => {
    const r = nativeDependencies("x", { "react-native": "0.79.0" }, host);
    expect(r.errors[0]).toMatch(/doesn't match the app's "0.88.1"/);
    expect(r.packages).toEqual({});
  });
});

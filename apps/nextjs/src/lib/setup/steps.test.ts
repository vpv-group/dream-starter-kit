import { describe, expect, it } from "vitest";

import { setupSteps, stepPosition } from "./steps";

const ctx = {
  askAccountModel: true,
  updatesAvailable: true,
  githubConnected: false,
};

describe("setup steps", () => {
  it("runs every step on a fresh public deployment", () => {
    expect(setupSteps(ctx)).toEqual([
      "account-model",
      "content",
      "connect-code",
      "app-updates",
    ]);
    expect(stepPosition("app-updates", ctx)).toEqual({
      index: "04",
      total: "04",
    });
  });

  it("skips Connect your code when GitHub is already connected", () => {
    const connected = { ...ctx, githubConnected: true };
    expect(stepPosition("connect-code", connected)).toBeNull();
    expect(stepPosition("app-updates", connected)).toEqual({
      index: "03",
      total: "03",
    });
  });

  it("has only the content step on localhost once the model is chosen", () => {
    const local = { ...ctx, askAccountModel: false, updatesAvailable: false };
    expect(setupSteps(local)).toEqual(["content"]);
    expect(stepPosition("content", local)).toEqual({
      index: "01",
      total: "01",
    });
  });
});

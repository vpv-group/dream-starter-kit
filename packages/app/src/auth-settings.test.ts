import { describe, expect, it } from "vitest";

import {
  chooserEntries,
  DEFAULT_AUTH_SETTINGS,
  DEFAULT_ONBOARDING_STEPS,
  isEmailDomainAllowed,
  isWorkspaceMode,
  normalizeAuthSettings,
  resolveDefaultMethod,
  ssoParamsForEmail,
} from "./auth-settings";

describe("auth-settings normalizer", () => {
  it("falls back to kit defaults for null/empty input", () => {
    const s = normalizeAuthSettings(null);
    expect(s.orderedMethods).toEqual(["magicLink", "emailOtp", "password"]);
    expect(s.methods.google).toBe(false);
    expect(s.termsUrl).toBe("/legal/terms-of-service");
    expect(s).toEqual(DEFAULT_AUTH_SETTINGS);
  });

  it("honors a reordered + toggled method list and backfills missing methods", () => {
    const s = normalizeAuthSettings({
      loginMethods: [
        { method: "google", enabled: true },
        { method: "password", enabled: true },
        { method: "magicLink", enabled: false },
      ],
    });
    // Order is preserved; disabled + omitted methods drop out of orderedMethods.
    expect(s.orderedMethods).toEqual(["google", "password"]);
    expect(resolveDefaultMethod(s)).toBe("google");
    // Every method is still present once in the full list (backfilled disabled).
    expect(s.loginMethods.map((r) => r.method).sort()).toEqual(
      ["apple", "emailOtp", "google", "magicLink", "password", "sso"].sort(),
    );
    expect(s.methods.emailOtp).toBe(false);
  });

  it("collapses email methods into one chooser entry at the first enabled position", () => {
    const s = normalizeAuthSettings({
      loginMethods: [
        { method: "google", enabled: true },
        { method: "magicLink", enabled: true },
        { method: "password", enabled: true },
        { method: "sso", enabled: true },
      ],
    });
    expect(chooserEntries(s)).toEqual(["google", "email", "sso"]);
  });

  it("clamps the minimum password length to [6, 72]", () => {
    expect(
      normalizeAuthSettings({ minPasswordLength: 2 }).minPasswordLength,
    ).toBe(6);
    expect(
      normalizeAuthSettings({ minPasswordLength: 999 }).minPasswordLength,
    ).toBe(72);
    expect(
      normalizeAuthSettings({ minPasswordLength: 12 }).minPasswordLength,
    ).toBe(12);
  });
});

describe("email domain rules", () => {
  const base = normalizeAuthSettings({
    emailDomainMode: "allowlist",
    emailDomains: [{ domain: "Acme.com" }],
  });

  it("allows everything when mode is off", () => {
    expect(isEmailDomainAllowed("x@any.com", DEFAULT_AUTH_SETTINGS)).toBe(true);
  });

  it("enforces an allowlist (case-insensitive)", () => {
    expect(isEmailDomainAllowed("jo@acme.com", base)).toBe(true);
    expect(isEmailDomainAllowed("jo@evil.com", base)).toBe(false);
  });

  it("enforces a blocklist", () => {
    const block = normalizeAuthSettings({
      emailDomainMode: "blocklist",
      emailDomains: [{ domain: "spam.com" }],
    });
    expect(isEmailDomainAllowed("jo@spam.com", block)).toBe(false);
    expect(isEmailDomainAllowed("jo@ok.com", block)).toBe(true);
  });
});

describe("sso routing", () => {
  const s = normalizeAuthSettings({
    ssoDomains: [
      { domain: "acme.com", providerId: "prov-123" },
      { domain: "bydomain.com" },
    ],
  });

  it("resolves a provider id when configured", () => {
    expect(ssoParamsForEmail("jo@acme.com", s)).toEqual({
      providerId: "prov-123",
    });
  });

  it("falls back to the bare domain when no provider id is set", () => {
    expect(ssoParamsForEmail("jo@bydomain.com", s)).toEqual({
      domain: "bydomain.com",
    });
  });

  it("returns null for an unmapped domain", () => {
    expect(ssoParamsForEmail("jo@other.com", s)).toBeNull();
  });
});

describe("auth-settings: account model", () => {
  it("defaults to the consumer model with the built-in onboarding steps", () => {
    const s = normalizeAuthSettings(undefined);
    expect(s.accountModel).toBe("consumer");
    expect(s.accountModelChosen).toBe(false);
    expect(isWorkspaceMode(s)).toBe(false);
    expect(s.workspaceLabel).toBe("Workspace");
    expect(s.inviteExpiryDays).toBe(7);
    expect(s.allowInviteLinks).toBe(true);
    expect(s.onboardingSteps).toEqual(DEFAULT_ONBOARDING_STEPS);
  });

  it("reads business/hybrid, the chosen timestamp and the label", () => {
    const s = normalizeAuthSettings({
      accountModel: "business",
      accountModelChosenAt: "2026-11-18T00:00:00.000Z",
      workspaceLabel: "Team",
      workspaceUrlPrefix: "  app.example.com/ ",
    });
    expect(s.accountModel).toBe("business");
    expect(s.accountModelChosen).toBe(true);
    expect(isWorkspaceMode(s)).toBe(true);
    expect(s.workspaceLabel).toBe("Team");
    expect(s.workspaceUrlPrefix).toBe("app.example.com/");
    expect(normalizeAuthSettings({ accountModel: "hybrid" }).accountModel).toBe(
      "hybrid",
    );
  });

  it("is idempotent over its own JSON output (the /api/auth/config shape)", () => {
    const once = normalizeAuthSettings({
      accountModel: "hybrid",
      accountModelChosenAt: "2026-11-18T00:00:00.000Z",
    });
    const twice = normalizeAuthSettings(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
  });

  it("rejects unknown models/labels and clamps invite expiry to [1, 30]", () => {
    const s = normalizeAuthSettings({
      accountModel: "enterprise",
      workspaceLabel: "Guild",
      inviteExpiryDays: 90,
    });
    expect(s.accountModel).toBe("consumer");
    expect(s.workspaceLabel).toBe("Workspace");
    expect(s.inviteExpiryDays).toBe(30);
    expect(
      normalizeAuthSettings({ inviteExpiryDays: 0 }).inviteExpiryDays,
    ).toBe(1);
  });

  it("dedupes onboarding steps and backfills missing built-ins as disabled", () => {
    const s = normalizeAuthSettings({
      onboardingSteps: [
        { step: "updates", enabled: true },
        { step: "updates", enabled: false },
        { step: "profile", enabled: true },
        { step: "Not A Key!", enabled: true },
        { step: "module:chat-adapter-slack:connect", enabled: true },
      ],
    });
    expect(s.onboardingSteps.map((r) => r.step)).toEqual([
      "updates",
      "profile",
      "module:chat-adapter-slack:connect",
      "invite",
      "integrations",
      "plan",
    ]);
    expect(s.onboardingSteps.find((r) => r.step === "invite")?.enabled).toBe(
      false,
    );
  });
});

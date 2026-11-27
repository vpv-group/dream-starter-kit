import { describe, expect, it } from "vitest";

import { DEFAULT_AUTH_SETTINGS } from "./auth-settings";
import {
  createWorkspaceSchema,
  readEmailPreferences,
} from "./validators/workspace";
import {
  activeOnboardingSteps,
  labelPlural,
  labelWithArticle,
  nextOnboardingStep,
  normalizeSlugInput,
  parseAllowedDomains,
  parseEmailList,
  RESERVED_WORKSPACE_SLUGS,
  slugifyWorkspaceName,
  stepEyebrow,
  validateWorkspaceSlug,
  workspaceErrorMessage,
} from "./workspaces";

describe("workspace slugs", () => {
  it("accepts 2–39 lowercase chars with single inner hyphens", () => {
    for (const ok of [
      "ab",
      "acme",
      "edgehill-co",
      "a1-b2-c3",
      "x".repeat(39),
    ]) {
      expect(validateWorkspaceSlug(ok)).toEqual({ ok: true });
    }
  });

  it("rejects bad formats", () => {
    for (const bad of [
      "a",
      "-ab",
      "ab-",
      "a--b",
      "Acme",
      "vy ten",
      "vy_ten",
      "x".repeat(40),
    ]) {
      expect(validateWorkspaceSlug(bad)).toEqual({
        ok: false,
        problem: "format",
      });
    }
    expect(validateWorkspaceSlug("")).toEqual({ ok: false, problem: "empty" });
  });

  it("rejects every reserved route slug that is otherwise well-formed", () => {
    for (const slug of RESERVED_WORKSPACE_SLUGS) {
      const res = validateWorkspaceSlug(slug);
      expect(res.ok).toBe(false);
    }
    expect(validateWorkspaceSlug("admin")).toEqual({
      ok: false,
      problem: "reserved",
    });
    expect(validateWorkspaceSlug("cms-setup")).toEqual({
      ok: false,
      problem: "reserved",
    });
  });

  it("derives a slug from a name", () => {
    expect(slugifyWorkspaceName("Acme")).toBe("acme");
    expect(slugifyWorkspaceName("  Edgehill Co, Inc. ")).toBe(
      "edgehill-co-inc",
    );
    expect(slugifyWorkspaceName("Café Ünïcode")).toBe("cafe-unicode");
    expect(slugifyWorkspaceName("!!")).toBe("");
    expect(slugifyWorkspaceName("A")).toBe("");
    const long = slugifyWorkspaceName("word ".repeat(20));
    expect(long.length).toBeLessThanOrEqual(39);
    expect(long.endsWith("-")).toBe(false);
  });

  it("normalizes typed slug input", () => {
    expect(normalizeSlugInput("My Team!!")).toBe("my-team");
    expect(normalizeSlugInput("a--b")).toBe("a-b");
  });

  it("validates the create form with zod", () => {
    expect(
      createWorkspaceSchema.safeParse({ name: " Acme ", slug: "acme" }).success,
    ).toBe(true);
    expect(
      createWorkspaceSchema.safeParse({ name: "", slug: "acme" }).success,
    ).toBe(false);
    expect(
      createWorkspaceSchema.safeParse({ name: "X", slug: "admin" }).success,
    ).toBe(false);
  });
});

describe("workspace copy", () => {
  it("uses the right article for the label", () => {
    expect(labelWithArticle("Workspace")).toBe("a workspace");
    expect(labelWithArticle("Organization")).toBe("an organization");
  });

  it("maps RPC error codes to copy with the label", () => {
    expect(workspaceErrorMessage({ message: "slug_unavailable" })).toBe(
      "That URL is taken. Try another.",
    );
    expect(workspaceErrorMessage({ message: "not_a_member" }, "Team")).toBe(
      "You're not a member of that team.",
    );
    expect(workspaceErrorMessage({ message: "boom" })).toMatch(/try again/);
    expect(workspaceErrorMessage(null)).toMatch(/try again/);
  });

  it("fills email preference defaults", () => {
    expect(readEmailPreferences({})).toEqual({
      tips: true,
      product_updates: false,
    });
    expect(readEmailPreferences({ product_updates: true, junk: 1 })).toEqual({
      tips: true,
      product_updates: true,
    });
    expect(readEmailPreferences("nope")).toEqual({
      tips: true,
      product_updates: false,
    });
  });
});

describe("onboarding step registry", () => {
  const settings = DEFAULT_AUTH_SETTINGS;

  it("shows only shipped steps: profile, invite, updates for a creator", () => {
    const steps = activeOnboardingSteps(settings, {
      isAdmin: true,
      isInvitee: false,
    });
    // integrations + plan (PR 3) are not available yet.
    expect(steps.map((s) => s.key)).toEqual(["profile", "invite", "updates"]);
  });

  it("respects the founder's order and toggles", () => {
    const steps = activeOnboardingSteps(
      {
        onboardingSteps: [
          { step: "updates", enabled: true },
          { step: "profile", enabled: false },
        ],
      },
      { isAdmin: true, isInvitee: false },
    );
    expect(steps.map((s) => s.key)).toEqual(["updates"]);
  });

  it("filters admin-only and creator-only steps by audience", () => {
    const steps = activeOnboardingSteps(settings, {
      isAdmin: false,
      isInvitee: true,
    });
    expect(steps.every((s) => s.forInvitees && !s.adminOnly)).toBe(true);
  });

  it("walks forward and builds the eyebrow", () => {
    const steps = activeOnboardingSteps(settings, {
      isAdmin: true,
      isInvitee: false,
    });
    expect(nextOnboardingStep(steps, "profile")?.key).toBe("invite");
    expect(nextOnboardingStep(steps, "invite")?.key).toBe("updates");
    expect(nextOnboardingStep(steps, "updates")).toBeNull();
    expect(nextOnboardingStep(steps, "unknown")?.key).toBe("profile");
    expect(stepEyebrow(steps, "updates")).toEqual({ index: "03", total: "03" });
    expect(stepEyebrow(steps, "nope")).toBeNull();
  });
});

describe("invitations helpers", () => {
  it("parses pasted email lists", () => {
    expect(
      parseEmailList(
        "Ana@Acme.com, bob@acme.com;\nana@acme.com  nope, Carl Diaz <carl@x.io>",
      ),
    ).toEqual({
      valid: ["ana@acme.com", "bob@acme.com", "carl@x.io"],
      invalid: ["nope"],
    });
    expect(parseEmailList("   ")).toEqual({ valid: [], invalid: [] });
  });

  it("validates invite-link domains and blocks free mail", () => {
    expect(parseAllowedDomains("Acme.com, @acme.io")).toEqual({
      ok: true,
      domains: ["acme.com", "acme.io"],
    });
    expect(parseAllowedDomains("gmail.com").ok).toBe(false);
    expect(parseAllowedDomains("not a domain").ok).toBe(false);
    expect(parseAllowedDomains("")).toEqual({ ok: true, domains: [] });
  });
});

describe("labelPlural", () => {
  it("pluralizes every founder label", () => {
    expect(labelPlural("Workspace")).toBe("Workspaces");
    expect(labelPlural("Organization")).toBe("Organizations");
    expect(labelPlural("Team")).toBe("Teams");
    expect(labelPlural("Practice")).toBe("Practices");
    expect(labelPlural("Business")).toBe("Businesses");
  });
});

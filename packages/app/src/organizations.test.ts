import { describe, expect, it } from "vitest";

import type { OrgSummary } from "./organizations";
import { pickActiveOrg, resolveOrganizationGate } from "./organizations";
import {
  normalizeWebsite,
  organizationSchema,
  websiteDomain,
} from "./validators/organization";

const org = (id: string, isPersonal = false): OrgSummary => ({
  id,
  name: id,
  website: null,
  isPersonal,
  role: "member",
});

describe("resolveOrganizationGate", () => {
  const base = { isStaff: false, isAnonymous: false, hasMembership: false };
  it("sends members-less users to onboarding only in required mode", () => {
    expect(resolveOrganizationGate({ ...base, mode: "required" })).toBe(
      "/onboarding/organization",
    );
    expect(resolveOrganizationGate({ ...base, mode: "personal" })).toBeNull();
    expect(resolveOrganizationGate({ ...base, mode: "off" })).toBeNull();
  });
  it("never gates staff, anonymous users or existing members", () => {
    expect(
      resolveOrganizationGate({ ...base, mode: "required", isStaff: true }),
    ).toBeNull();
    expect(
      resolveOrganizationGate({ ...base, mode: "required", isAnonymous: true }),
    ).toBeNull();
    expect(
      resolveOrganizationGate({
        ...base,
        mode: "required",
        hasMembership: true,
      }),
    ).toBeNull();
  });
});

describe("pickActiveOrg", () => {
  it("prefers the stored org, then the oldest non-personal one", () => {
    const orgs = [org("p", true), org("a"), org("b")];
    expect(pickActiveOrg(orgs, "b")?.id).toBe("b");
    expect(pickActiveOrg(orgs, "gone")?.id).toBe("a");
    expect(pickActiveOrg([org("p", true)], null)?.id).toBe("p");
    expect(pickActiveOrg([], "x")).toBeNull();
  });
});

describe("organization validators", () => {
  it("normalises websites and extracts domains", () => {
    expect(normalizeWebsite("acme.com")).toBe("https://acme.com");
    expect(normalizeWebsite("  ")).toBeUndefined();
    expect(websiteDomain("https://www.Acme.com/about")).toBe("acme.com");
    expect(websiteDomain("not a url")).toBeNull();
  });
  it("requires a name and a valid website when given", () => {
    expect(organizationSchema.safeParse({ name: "" }).success).toBe(false);
    expect(
      organizationSchema.safeParse({ name: "Acme", website: "acme.com" })
        .success,
    ).toBe(true);
    expect(
      organizationSchema.safeParse({ name: "Acme", website: "a b" }).success,
    ).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const update = vi.fn(() => Promise.resolve({}));
let existingDoc: Record<string, unknown> = {};

vi.mock("./payload-client", () => ({
  getPayloadClient: () =>
    Promise.resolve({
      find: () => Promise.resolve({ totalDocs: 1, docs: [existingDoc] }),
      update,
    }),
}));
vi.mock("./ensure-schema", () => ({
  withCmsSchemaHeal: (_payload: unknown, fn: () => Promise<unknown>) => fn(),
}));
vi.mock("~/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const { ensureCmsUser } = await import("./mirror-user");

describe("ensureCmsUser with syncProfile", () => {
  beforeEach(() => {
    update.mockClear();
    existingDoc = {
      id: 7,
      email: "a@example.com",
      displayName: "Ada",
      phone: "+44 7700 900123",
      jobTitle: null,
    };
  });

  it("doesn't write when the profile already matches (no updatedAt bump)", async () => {
    const ok = await ensureCmsUser({
      id: "u1",
      email: "a@example.com",
      syncProfile: {
        displayName: "Ada",
        phone: "+44 7700 900123",
        jobTitle: null,
      },
    });
    expect(ok).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it("writes only the fields that changed", async () => {
    await ensureCmsUser({
      id: "u1",
      email: "a@example.com",
      syncProfile: { displayName: "Ada L.", phone: "+44 7700 900123" },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7, data: { displayName: "Ada L." } }),
    );
  });
});

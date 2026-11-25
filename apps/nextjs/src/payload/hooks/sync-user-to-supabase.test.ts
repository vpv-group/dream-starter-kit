import type { CollectionBeforeChangeHook } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { syncUserToSupabase } from "./sync-user-to-supabase";

// Fake service-role client: records auth.admin.updateUserById + the profiles
// update so each test can assert exactly what was written to Supabase.
const updateUserById =
  vi.fn<
    (
      id: string,
      attrs: Record<string, unknown>,
    ) => Promise<{ error: { code?: string; message: string } | null }>
  >();
const profileUpdate = vi.fn<(values: Record<string, unknown>) => void>();
const profileEq =
  vi.fn<
    (col: string, id: string) => Promise<{ error: { message: string } | null }>
  >();

vi.mock("../../lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        updateUserById: (id: string, attrs: Record<string, unknown>) =>
          updateUserById(id, attrs),
      },
    },
    from: (table: string) => {
      if (table !== "profiles") throw new Error(`unexpected table ${table}`);
      return {
        update: (values: Record<string, unknown>) => {
          profileUpdate(values);
          return { eq: (col: string, id: string) => profileEq(col, id) };
        },
      };
    },
  }),
}));

const ORIGINAL = {
  id: 1,
  supabaseUserId: "auth-123",
  email: "old@example.com",
  displayName: "Old Name",
  phone: "+1 555 0100",
  jobTitle: "Engineer",
  roles: ["member"],
};

// ORIGINAL without `roles`: an edit that doesn't touch the roles field, so
// no `is_staff` reconciliation is expected.
const { roles: _roles, ...FIELDS } = ORIGINAL;

function run(
  data: Record<string, unknown>,
  opts: {
    operation?: "create" | "update";
    user?: unknown;
    context?: Record<string, unknown>;
    originalDoc?: Record<string, unknown>;
  } = {},
) {
  const hook = syncUserToSupabase as unknown as CollectionBeforeChangeHook;
  return Promise.resolve(
    hook({
      data,
      originalDoc: opts.originalDoc ?? ORIGINAL,
      operation: opts.operation ?? "update",
      req: {
        user: "user" in opts ? opts.user : { id: 9, roles: ["admin"] },
        context: opts.context ?? {},
        payload: { logger: { info: vi.fn() } },
      },
    } as unknown as Parameters<CollectionBeforeChangeHook>[0]),
  ) as Promise<unknown>;
}

describe("syncUserToSupabase", () => {
  beforeEach(() => {
    updateUserById.mockReset().mockResolvedValue({ error: null });
    profileUpdate.mockReset();
    profileEq.mockReset().mockResolvedValue({ error: null });
  });

  it("writes an admin email change through to Supabase Auth, pre-confirmed", async () => {
    await run({ ...FIELDS, email: "new@example.com" });
    expect(updateUserById).toHaveBeenCalledWith("auth-123", {
      email: "new@example.com",
      email_confirm: true,
    });
    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it("ignores a case-only email difference", async () => {
    await run({ ...FIELDS, email: "OLD@example.com" });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("syncs display name, phone and job title to profiles + user_metadata", async () => {
    await run({
      ...FIELDS,
      displayName: "New Name",
      phone: "+44 7700 900123",
      jobTitle: "",
    });
    expect(updateUserById).toHaveBeenCalledWith("auth-123", {
      user_metadata: { display_name: "New Name", phone: "+44 7700 900123" },
    });
    expect(profileUpdate).toHaveBeenCalledWith({
      display_name: "New Name",
      phone: "+44 7700 900123",
      title: null,
    });
    expect(profileEq).toHaveBeenCalledWith("id", "auth-123");
  });

  it("only diffs keys present in a partial update", async () => {
    await run({ phone: "+1 555 0199" });
    expect(updateUserById).toHaveBeenCalledWith("auth-123", {
      user_metadata: { phone: "+1 555 0199" },
    });
    expect(profileUpdate).toHaveBeenCalledWith({ phone: "+1 555 0199" });
  });

  it("does nothing when no synced field changed", async () => {
    await run({ ...FIELDS, bio: "hello" });
    expect(updateUserById).not.toHaveBeenCalled();
    expect(profileUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ["a create", { operation: "create" as const }],
    ["a server-side write (no req.user)", { user: undefined }],
    [
      "a write flagged skipSupabaseSync",
      { context: { skipSupabaseSync: true } },
    ],
    ["an unlinked row", { originalDoc: { ...ORIGINAL, supabaseUserId: null } }],
    [
      "a trashed row",
      { originalDoc: { ...ORIGINAL, deletedAt: "2026-01-01T00:00:00Z" } },
    ],
  ])("skips %s", async (_label, opts) => {
    await run({ ...ORIGINAL, email: "new@example.com" }, opts);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("surfaces a taken email as a 409 and aborts the save", async () => {
    updateUserById.mockResolvedValue({
      error: { code: "email_exists", message: "exists" },
    });
    await expect(
      run({ ...ORIGINAL, email: "taken@example.com" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("refuses to clear a linked user's email", async () => {
    await expect(run({ ...ORIGINAL, email: "" })).rejects.toMatchObject({
      status: 400,
    });
  });

  describe("staff access follows roles", () => {
    it.each([
      [["editor"], true],
      [["author"], true],
      [["member", "admin"], true],
      [["member"], false],
    ])("roles %j → is_staff %s", async (roles, isStaff) => {
      await run({ ...FIELDS, roles });
      expect(profileUpdate).toHaveBeenCalledWith({ is_staff: isStaff });
      expect(profileEq).toHaveBeenCalledWith("id", "auth-123");
      expect(updateUserById).not.toHaveBeenCalled();
    });

    it("demoting a staff user to member clears is_staff", async () => {
      await run(
        { ...FIELDS, roles: ["member"] },
        { originalDoc: { ...ORIGINAL, roles: ["editor"] } },
      );
      expect(profileUpdate).toHaveBeenCalledWith({ is_staff: false });
    });

    it("reconciles on every admin save that carries roles (heals drift)", async () => {
      await run({ ...ORIGINAL });
      expect(profileUpdate).toHaveBeenCalledWith({ is_staff: false });
    });

    it("folds is_staff into the same profiles write as other fields", async () => {
      await run({ ...FIELDS, phone: "+1 555 0199", roles: ["editor"] });
      expect(profileUpdate).toHaveBeenCalledTimes(1);
      expect(profileUpdate).toHaveBeenCalledWith({
        phone: "+1 555 0199",
        is_staff: true,
      });
    });

    it("leaves is_staff alone when roles aren't in the update", async () => {
      await run({ phone: "+1 555 0199" });
      expect(profileUpdate).toHaveBeenCalledWith({ phone: "+1 555 0199" });
    });

    it("ignores roles sent by a non-admin", async () => {
      await run(
        { ...FIELDS, roles: ["admin"] },
        { user: { id: 9, roles: ["editor"] } },
      );
      expect(profileUpdate).not.toHaveBeenCalled();
    });

    it("refuses to let an admin remove their own admin role", async () => {
      await expect(
        run(
          { ...FIELDS, roles: ["editor"] },
          { originalDoc: { ...ORIGINAL, id: 9, roles: ["admin"] } },
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(profileUpdate).not.toHaveBeenCalled();
    });

    it("lets an admin demote another admin", async () => {
      await run(
        { ...FIELDS, roles: ["member"] },
        { originalDoc: { ...ORIGINAL, roles: ["admin"] } },
      );
      expect(profileUpdate).toHaveBeenCalledWith({ is_staff: false });
    });
  });

  it("surfaces a profiles write failure", async () => {
    profileEq.mockResolvedValue({ error: { message: "nope" } });
    await expect(
      run({ ...ORIGINAL, phone: "+1 555 0123" }),
    ).rejects.toMatchObject({ status: 502 });
  });
});

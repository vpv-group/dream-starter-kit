import type { Payload } from "payload";
import { describe, expect, it, vi } from "vitest";

import { eraseAccountOutsidePublic } from "./erasure";

type Entry = { name: string; id: string | null };

function fakeAdmin(opts: {
  userExists?: boolean;
  tree?: Record<string, Record<string, Entry[]>>;
}) {
  const removed: { bucket: string; paths: string[] }[] = [];
  const rpc = vi.fn(() => Promise.resolve({ data: null, error: null }));
  const admin = {
    auth: {
      admin: {
        getUserById: () =>
          Promise.resolve(
            opts.userExists
              ? { data: { user: { id: "u1" } }, error: null }
              : {
                  data: { user: null },
                  error: { status: 404, message: "User not found" },
                },
          ),
      },
    },
    storage: {
      from: (bucket: string) => ({
        list: (prefix: string) => {
          const byBucket = opts.tree?.[bucket];
          if (!byBucket)
            return Promise.resolve({
              data: null,
              error: { message: "Bucket not found" },
            });
          return Promise.resolve({ data: byBucket[prefix] ?? [], error: null });
        },
        remove: (paths: string[]) => {
          removed.push({ bucket, paths });
          return Promise.resolve({ error: null });
        },
      }),
    },
    rpc,
  };
  return { admin, removed, rpc };
}

function fakePayload(docs: { id: number }[]) {
  const deleted: unknown[] = [];
  const payload = {
    find: vi.fn(() => Promise.resolve({ docs })),
    delete: vi.fn((args: unknown) => {
      deleted.push(args);
      return Promise.resolve({});
    }),
  } as unknown as Payload;
  return { payload, deleted };
}

describe("eraseAccountOutsidePublic", () => {
  it("does nothing while the auth user still exists", async () => {
    const { admin, removed } = fakeAdmin({ userExists: true });
    const { payload, deleted } = fakePayload([{ id: 1 }]);
    const result = await eraseAccountOutsidePublic(payload, "u1", {
      admin: admin as never,
    });
    expect(result.skipped).toBe("user-exists");
    expect(deleted).toEqual([]);
    expect(removed).toEqual([]);
  });

  it("deletes the CMS user even from the Trash, and nested storage", async () => {
    const { admin, removed, rpc } = fakeAdmin({
      tree: {
        "user-files": {
          u1: [
            { name: "a.png", id: "1" },
            { name: "docs", id: null },
          ],
          "u1/docs": [{ name: "b.pdf", id: "2" }],
        },
        avatars: { u1: [{ name: "me.jpg", id: "3" }] },
        // chat-uploads: bucket missing (module not installed)
      },
    });
    const { payload, deleted } = fakePayload([{ id: 7 }]);
    const result = await eraseAccountOutsidePublic(payload, "u1", {
      admin: admin as never,
    });
    expect(deleted).toEqual([
      expect.objectContaining({ collection: "users", id: 7, trash: true }),
    ]);
    expect(removed).toEqual([
      { bucket: "user-files", paths: ["u1/a.png", "u1/docs/b.pdf"] },
      { bucket: "avatars", paths: ["u1/me.jpg"] },
    ]);
    expect(result).toEqual({ cmsUsersDeleted: 1, storageObjectsDeleted: 3 });
    expect(rpc).toHaveBeenCalledWith(
      "audit_log_event",
      expect.objectContaining({ _action: "account.erased" }),
    );
  });
});

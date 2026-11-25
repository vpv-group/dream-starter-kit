import type { Payload } from "payload";
import { describe, expect, it, vi } from "vitest";

import { seedNativeNavigation } from "./native-nav-seed";

function fakePayload(global: Record<string, unknown>) {
  const updateGlobal = vi.fn().mockResolvedValue({});
  const find = vi.fn().mockResolvedValue({
    docs: [{ id: 3 }, { id: 1 }, { id: 2 }],
  });
  const payload = {
    findGlobal: vi.fn().mockResolvedValue(global),
    find,
    updateGlobal,
  } as unknown as Payload;
  return { payload, find, updateGlobal };
}

describe("seedNativeNavigation", () => {
  it("publishes a 4-tab menu of the native rows in order", async () => {
    const { payload, find, updateGlobal } = fakePayload({});
    await seedNativeNavigation(payload);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "nav-items",
        where: { platforms: { in: ["native"] } },
        sort: "_order",
      }),
    );
    expect(updateGlobal).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "native-navigation",
        data: {
          tabCount: "4",
          items: [
            { item: 3, hidden: false },
            { item: 1, hidden: false },
            { item: 2, hidden: false },
          ],
          _status: "published",
        },
      }),
    );
  });

  it("leaves a menu staff already saved alone", async () => {
    const { payload, updateGlobal } = fakePayload({
      updatedAt: "2026-11-25T03:04:09.936Z",
      tabCount: "3",
    });
    await seedNativeNavigation(payload);
    expect(updateGlobal).not.toHaveBeenCalled();
  });
});

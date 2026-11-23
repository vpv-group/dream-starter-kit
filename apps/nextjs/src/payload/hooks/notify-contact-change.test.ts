import type { CollectionAfterChangeHook } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { notifyContactChange } from "./notify-contact-change";

const sendEmail =
  vi.fn<
    (msg: {
      to: string;
      subject: string;
      html: string;
      text: string;
    }) => Promise<void>
  >();
const logError = vi.fn();

const BASE = {
  id: 7,
  email: "member@example.com",
  phone: "+1 555 010 0100",
  deletedAt: null,
};

function run(
  doc: Record<string, unknown>,
  previousDoc: Record<string, unknown> = BASE,
  operation: "create" | "update" = "update",
) {
  const hook = notifyContactChange as unknown as CollectionAfterChangeHook;
  return Promise.resolve(
    hook({
      doc,
      previousDoc,
      operation,
      req: {
        payload: { sendEmail, logger: { info: vi.fn(), error: logError } },
      },
    } as unknown as Parameters<CollectionAfterChangeHook>[0]),
  ) as Promise<unknown>;
}

describe("notifyContactChange", () => {
  beforeEach(() => {
    sendEmail.mockReset().mockResolvedValue(undefined);
    logError.mockReset();
  });

  it("emails a masked notice when the phone changes", async () => {
    await run({ ...BASE, phone: "+44 7700 900123" });
    expect(sendEmail).toHaveBeenCalledOnce();
    const msg = sendEmail.mock.calls[0]?.[0];
    expect(msg?.to).toBe("member@example.com");
    expect(msg?.subject).toBe("Your phone number was changed");
    expect(msg?.text).toContain("ending in 0123");
    expect(msg?.text).not.toContain("7700 900123");
  });

  it("covers a phone being added and removed", async () => {
    await run({ ...BASE, phone: "+1 555 010 0199" }, { ...BASE, phone: null });
    expect(sendEmail.mock.calls[0]?.[0].text).toContain("was added");
    await run({ ...BASE, phone: "" });
    expect(sendEmail.mock.calls[1]?.[0].subject).toBe(
      "Your phone number was removed",
    );
  });

  it.each([
    [
      "unchanged (whitespace only)",
      { ...BASE, phone: " +1 555 010 0100 " },
      BASE,
      "update",
    ],
    ["a create", { ...BASE, phone: "+1 555 010 0199" }, BASE, "create"],
    [
      "a trashed row",
      { ...BASE, phone: "+1 555 010 0199", deletedAt: "2026-01-01" },
      BASE,
      "update",
    ],
    [
      "no email",
      { ...BASE, email: "", phone: "+1 555 010 0199" },
      BASE,
      "update",
    ],
  ] as const)("skips %s", async (_label, doc, prev, op) => {
    await run(doc, prev, op);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("logs, never throws, when sending fails", async () => {
    sendEmail.mockRejectedValue(new Error("smtp down"));
    await expect(
      run({ ...BASE, phone: "+1 555 010 0199" }),
    ).resolves.toBeDefined();
    expect(logError).toHaveBeenCalledOnce();
  });
});

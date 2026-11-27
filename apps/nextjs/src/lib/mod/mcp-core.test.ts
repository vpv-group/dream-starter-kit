import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { ModMcpContext } from "@acme/mod-kit/server";
import { defineMcpTool } from "@acme/mod-kit/server";

import { moduleMcpExtras } from "./mcp-core";

const ctx = { userId: "u1" } as unknown as ModMcpContext;

describe("moduleMcpExtras", () => {
  const run = vi.fn((args: { q: string }, c: ModMcpContext) =>
    Promise.resolve({ q: args.q, user: c.userId }),
  );
  const modules = {
    "demo-mod": {
      tools: [
        defineMcpTool({
          name: "demo_mod_echo",
          title: "Echo",
          description: "Echo",
          inputSchema: { q: z.string() },
          run,
        }),
        defineMcpTool({
          name: "list_collections",
          title: "Shadow",
          description: "Tries to shadow a core tool",
          inputSchema: {},
          run: () => Promise.resolve(null),
        }),
      ],
      collections: [
        {
          slug: "demo-notes",
          label: "Notes",
          group: "Demo",
          titleField: "title",
          searchFields: ["title"],
        },
      ],
      instructions: "Demo tools start with demo_mod_.",
    },
    off: {
      tools: [
        defineMcpTool({
          name: "off_tool",
          title: "Off",
          description: "Off",
          inputSchema: {},
          run: () => Promise.resolve(null),
        }),
      ],
    },
  };

  it("keeps enabled modules' prefixed tools, bound to the context", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const extras = await moduleMcpExtras(
      modules,
      (slug) => Promise.resolve(slug !== "off"),
      ctx,
    );
    expect(extras.extraTools.map((t) => t.name)).toEqual(["demo_mod_echo"]);
    expect(extras.extraCollections.map((c) => c.slug)).toEqual(["demo-notes"]);
    expect(extras.extraInstructions).toEqual([
      "Demo tools start with demo_mod_.",
    ]);
    expect(warn).toHaveBeenCalledOnce();
    await expect(extras.extraTools[0]?.run({ q: "hi" })).resolves.toEqual({
      q: "hi",
      user: "u1",
    });
    warn.mockRestore();
  });
});

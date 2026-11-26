import { readFileSync } from "node:fs";
import type { Payload } from "payload";
import { describe, expect, it } from "vitest";

import {
  adapterGroupName,
  composeSettingsTabs,
  defineAdapterSettings,
  defineModuleSettings,
  getAdapterSettings,
  getModuleSettings,
  ROW_LABEL_COMPONENT,
  settingsGroupName,
  updateModuleSettings,
} from "./payload";

describe("adapterGroupName", () => {
  it("turns a slug into a valid group field name", () => {
    expect(adapterGroupName("chat-adapter-slack")).toBe(
      "adapter_chat_adapter_slack",
    );
  });
});

describe("defineAdapterSettings", () => {
  const adapter = defineAdapterSettings({
    slug: "chat-adapter-slack",
    name: "Slack",
    target: "chat",
    description: "Answer in Slack.",
    fields: [{ name: "enabled", type: "checkbox", defaultValue: true }],
  });

  it("namespaces fields under a per-adapter group and collects inner defaults", () => {
    expect(adapter.target).toBe("chat");
    expect(adapter.groupName).toBe("adapter_chat_adapter_slack");
    expect(adapter.defaults).toEqual({ enabled: true });
    expect(adapter.tab.label).toBe("Slack");
    // One wrapping group named for the adapter holds the author fields.
    const group = adapter.tab.fields[0] as {
      name: string;
      type: string;
      fields: { name: string }[];
    };
    expect(group).toMatchObject({
      name: "adapter_chat_adapter_slack",
      type: "group",
    });
    expect(group.fields[0]?.name).toBe("enabled");
  });
});

describe("composeSettingsTabs", () => {
  const base = defineModuleSettings({
    slug: "chat",
    name: "AI Chat",
    fields: [
      {
        type: "tabs",
        tabs: [{ label: "General", fields: [] }],
      },
    ],
  });
  const slack = defineAdapterSettings({
    slug: "chat-adapter-slack",
    name: "Slack",
    target: "chat",
    fields: [{ name: "enabled", type: "checkbox", defaultValue: true }],
  });

  it("appends each adapter tab to the base tabs field and nests its defaults", () => {
    const composed = composeSettingsTabs(base, [slack]);
    const tabsField = composed.global.fields[0] as {
      tabs: { label: string }[];
    };
    expect(tabsField.tabs.map((t) => t.label)).toEqual(["General", "Slack"]);
    expect(composed.defaults).toMatchObject({
      adapter_chat_adapter_slack: { enabled: true },
    });
  });

  it("returns the base unchanged when there are no adapters", () => {
    expect(composeSettingsTabs(base, [])).toBe(base);
  });

  it("does not mutate the base settings", () => {
    composeSettingsTabs(base, [slack]);
    const baseTabs = base.global.fields[0] as { tabs: unknown[] };
    expect(baseTabs.tabs).toHaveLength(1);
    expect(base.defaults).not.toHaveProperty("adapter_chat_adapter_slack");
  });
});

describe("module settings on the kit-modules row", () => {
  const chat = defineModuleSettings({
    slug: "chat",
    name: "AI Chat",
    fields: [
      { name: "maxHistory", type: "number", defaultValue: 20 },
      { name: "model", type: "text", defaultValue: "a" },
    ],
  });
  const slack = defineAdapterSettings({
    slug: "chat-adapter-slack",
    name: "Slack",
    target: "chat",
    fields: [{ name: "enabled", type: "checkbox", defaultValue: true }],
  });

  function fakePayload(rows: Record<string, unknown>[]) {
    const updates: { id: unknown; data: Record<string, unknown> }[] = [];
    const payload = {
      find: ({ where }: { where: { slug: { equals: string } } }) =>
        Promise.resolve({
          docs: rows.filter((r) => r.slug === where.slug.equals),
        }),
      update: (args: { id: unknown; data: Record<string, unknown> }) => {
        updates.push(args);
        return Promise.resolve({});
      },
    } as unknown as Payload;
    return { payload, updates };
  }

  it("names the group after the slug and hides the legacy global", () => {
    expect(settingsGroupName("chat-adapter-slack")).toBe(
      "mod_chat_adapter_slack",
    );
    expect(chat.groupName).toBe("mod_chat");
    expect(chat.global.admin?.hidden).toBe(true);
  });

  it("reads the row's group over the defaults, ignoring nulls", async () => {
    const { payload } = fakePayload([
      { slug: "chat", mod_chat: { maxHistory: 5, model: null } },
    ]);
    expect(await getModuleSettings(payload, chat)).toEqual({
      maxHistory: 5,
      model: "a",
    });
  });

  it("falls back to the defaults before the row exists", async () => {
    const { payload } = fakePayload([]);
    expect(await getModuleSettings(payload, chat)).toEqual({
      maxHistory: 20,
      model: "a",
    });
  });

  it("reads an adapter's tab inside its target's group", async () => {
    const { payload } = fakePayload([
      {
        slug: "chat",
        mod_chat: { adapter_chat_adapter_slack: { enabled: false } },
      },
    ]);
    expect(await getAdapterSettings(payload, slack)).toEqual({
      enabled: false,
    });
  });

  it("writes settings into the module's group", async () => {
    const { payload, updates } = fakePayload([{ id: 7, slug: "chat" }]);
    await updateModuleSettings(payload, chat, { maxHistory: 9 });
    expect(updates).toEqual([
      expect.objectContaining({ id: 7, data: { mod_chat: { maxHistory: 9 } } }),
    ]);
  });
});

describe("ROW_LABEL_COMPONENT", () => {
  it("is pinned in the host's import map", () => {
    const importMap = readFileSync(
      new URL(
        "../../../apps/nextjs/src/app/(payload)/admin/importMap.js",
        import.meta.url,
      ),
      "utf8",
    );
    expect(importMap).toContain(`"${ROW_LABEL_COMPONENT}"`);
  });
});

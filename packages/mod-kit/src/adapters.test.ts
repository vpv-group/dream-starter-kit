import type { CollectionConfig } from "payload";
import { describe, expect, it } from "vitest";

import { defineModule } from "./manifest";
import {
  composeCollectionTabs,
  composeSettingsTabs,
  defineAdapterCollectionTab,
  defineAdapterSettings,
  defineModuleSettings,
  staffFieldAccess,
} from "./payload";
import {
  getConnectorBroker,
  getModAdapters,
  registerConnectorBroker,
  registerModAdapters,
  setModAdaptersForTest,
} from "./server";
import { validateManifest, validateManifestSet } from "./validate";

const base = {
  version: "1.0.0",
  kitCompat: ">=2.0.0 <3",
};

describe("adapter manifests", () => {
  const billing = defineModule({ ...base, slug: "billing", name: "Billing" });

  it("requires the adapter target in requires", () => {
    const m = defineModule({
      ...base,
      slug: "billing-adapter-stripe",
      name: "Stripe",
      adapter: { for: "billing", server: true },
    });
    expect(validateManifest(m).join("\n")).toMatch(
      /adapter.for "billing" must be listed in requires/,
    );
  });

  it("rejects an adapter that contributes nothing", () => {
    const m = defineModule({
      ...base,
      slug: "billing-adapter-x",
      name: "X",
      requires: ["billing"],
      adapter: { for: "billing" },
    });
    expect(validateManifest(m).join("\n")).toMatch(/declares no contribution/);
  });

  it("accepts a well-formed adapter", () => {
    const m = defineModule({
      ...base,
      slug: "billing-adapter-stripe",
      name: "Stripe",
      requires: ["billing"],
      adapter: { for: "billing", server: true, web: "webProvider" },
      cms: { settingsTabFor: "billing", hasCollectionTabs: true },
    });
    expect(validateManifest(m)).toEqual([]);
    expect(validateManifestSet([billing, m])).toEqual([]);
  });

  it("needs settingsTabFor for collection tabs", () => {
    const m = defineModule({
      ...base,
      slug: "billing-adapter-stripe",
      name: "Stripe",
      requires: ["billing"],
      cms: { hasCollectionTabs: true },
    });
    expect(validateManifest(m).join("\n")).toMatch(
      /hasCollectionTabs needs cms.settingsTabFor/,
    );
  });
});

describe("private adapter settings tabs", () => {
  it("locks an adapter group to staff unless it opts into public read", () => {
    const priv = defineAdapterSettings({
      slug: "billing-adapter-stripe",
      name: "Stripe",
      target: "billing",
      fields: [{ name: "enabled", type: "checkbox", defaultValue: true }],
    });
    const group = priv.tab.fields[0] as { access?: { read?: unknown } };
    expect(group.access?.read).toBe(staffFieldAccess);

    const pub = defineAdapterSettings({
      slug: "x",
      name: "X",
      target: "billing",
      publicRead: true,
      fields: [],
    });
    expect((pub.tab.fields[0] as { access?: unknown }).access).toBeUndefined();
  });

  it("stores under a short key when given one", () => {
    const tab = defineAdapterSettings({
      slug: "billing-adapter-stripe",
      key: "stripe",
      name: "Stripe",
      target: "billing",
      fields: [],
    });
    expect(tab.groupName).toBe("adapter_stripe");
    expect((tab.tab.fields[0] as { name: string }).name).toBe("adapter_stripe");
  });

  it("throws instead of silently dropping tabs when the base has none", () => {
    const flat = defineModuleSettings({
      slug: "billing",
      name: "Billing",
      fields: [{ name: "heading", type: "text" }],
    });
    const tab = defineAdapterSettings({
      slug: "billing-adapter-stripe",
      name: "Stripe",
      target: "billing",
      fields: [],
    });
    expect(() => composeSettingsTabs(flat, [tab])).toThrow(
      /no top-level "tabs"/,
    );
  });
});

describe("composeCollectionTabs", () => {
  const plans: CollectionConfig = {
    slug: "mod-billing-plans",
    fields: [
      { name: "name", type: "text" },
      { type: "tabs", tabs: [{ label: "Pricing", fields: [] }] },
    ],
  };
  const stripeTab = defineAdapterCollectionTab({
    slug: "billing-adapter-stripe",
    target: "billing",
    collection: "mod-billing-plans",
    label: "Stripe",
    fields: [{ name: "stripePriceId", type: "text" }],
  });

  it("appends an unnamed tab to the target collection only", () => {
    const other: CollectionConfig = { slug: "other", fields: [] };
    const [composed, untouched] = composeCollectionTabs(
      [plans, other],
      [stripeTab],
    );
    const tabs = (composed?.fields[1] as { tabs: { label: string }[] }).tabs;
    expect(tabs.map((t) => t.label)).toEqual(["Pricing", "Stripe"]);
    // Unnamed → no `name`, so the fields stay at the document root.
    expect("name" in (tabs[1] as object)).toBe(false);
    expect(untouched).toBe(other);
    // The input is not mutated.
    expect((plans.fields[1] as { tabs: unknown[] }).tabs).toHaveLength(1);
  });

  it("throws for a missing tabs field or an uninstalled collection", () => {
    const flat: CollectionConfig = { slug: "mod-billing-plans", fields: [] };
    expect(() => composeCollectionTabs([flat], [stripeTab])).toThrow(
      /no top-level "tabs"/,
    );
    expect(() => composeCollectionTabs([], [stripeTab])).toThrow(
      /isn't installed/,
    );
  });
});

describe("adapter registry", () => {
  it("loads adapters lazily, once, and replaces on re-register", async () => {
    let loads = 0;
    registerModAdapters({
      billing: [
        {
          slug: "billing-adapter-stripe",
          load: () => {
            loads += 1;
            return Promise.resolve({ adapter: { id: "stripe" } });
          },
        },
      ],
    });
    expect(loads).toBe(0);
    const first = await getModAdapters<{ id: string }>("billing");
    await getModAdapters("billing");
    expect(loads).toBe(1);
    expect(first.map((a) => a.adapter.id)).toEqual(["stripe"]);

    setModAdaptersForTest("billing", []);
    expect(await getModAdapters("billing")).toEqual([]);
    expect(await getModAdapters("unknown")).toEqual([]);
  });

  it("retries a failed load instead of caching the failure", async () => {
    let fail = true;
    registerModAdapters({
      chat: [
        {
          slug: "chat-adapter-x",
          load: () =>
            fail
              ? Promise.reject(new Error("server-only"))
              : Promise.resolve({ adapter: 1 }),
        },
      ],
    });
    await expect(getModAdapters("chat")).rejects.toThrow("server-only");
    fail = false;
    expect(await getModAdapters("chat")).toHaveLength(1);
  });
});

describe("connector broker", () => {
  it("is null until the host registers one", () => {
    expect(getConnectorBroker()).toBeNull();
    const broker = {
      startConnect: () => Promise.resolve({ status: "ok" as const, url: "x" }),
      token: () =>
        Promise.resolve({
          status: "not_connected" as const,
          message: "no",
        }),
      disconnect: () => Promise.resolve({ status: "ok" as const }),
    };
    registerConnectorBroker(broker);
    expect(getConnectorBroker()).toBe(broker);
  });
});

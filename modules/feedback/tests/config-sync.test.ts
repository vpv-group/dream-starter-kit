import { describe, expect, it } from "vitest";

import type { BoardDoc } from "../src/server/config-sync";
import {
  boardForm,
  boardRow,
  categoryRows,
  statusRows,
  tagRows,
} from "../src/server/config-sync";
import { DEFAULT_STATUSES, effectiveAnon, slugify } from "../src/shared/config";

const board: BoardDoc = {
  id: 7,
  name: "Feature Requests",
  slug: "feature-requests",
  access: "public",
  anonVotes: "allow",
  categories: [
    { key: "app", name: "App", subcategories: [{ name: "iOS & Android" }] },
    { name: "Integrations" },
  ],
  customFields: [
    {
      label: "Company size",
      required: true,
      type: "select",
      options: ["1-10"],
    },
  ],
};

describe("Payload → Supabase config mapping", () => {
  it("maps a board with defaults for unset toggles", () => {
    const row = boardRow(board, 3);
    expect(row).toMatchObject({
      id: "7",
      slug: "feature-requests",
      position: 3,
      access: "public",
      anon_votes: "allow",
      anon_posts: "inherit",
      allow_new_posts: true,
      show_voters: true,
      require_approval: false,
      archived: false,
    });
  });

  it("defaults new boards to private (staff only)", () => {
    expect(boardRow({ id: 1, name: "X", slug: "x" }, 0).access).toBe("staff");
  });

  it("fills the create form copy and keys custom fields", () => {
    const form = boardForm(board);
    expect(form.titlePlaceholder).toBe("Short, descriptive title");
    expect(form.submitLabel).toBe("Create Post");
    expect(form.customFields).toEqual([
      {
        key: "company-size",
        label: "Company size",
        required: true,
        type: "select",
        placeholder: "",
        options: ["1-10"],
      },
    ]);
  });

  it("keys categories by board, with one level of subcategories", () => {
    const rows = categoryRows(board);
    expect(rows.map((r) => [r.id, r.parent_id, r.position])).toEqual([
      ["7:app", null, 0],
      ["7:app/ios-android", "7:app", 0],
      ["7:integrations", null, 1],
    ]);
  });

  it("uses the stable status key as the id, in list order", () => {
    const rows = statusRows(DEFAULT_STATUSES);
    expect(rows.map((r) => r.id)).toEqual([
      "open",
      "under-review",
      "planned",
      "in-progress",
      "complete",
      "closed",
    ]);
    expect(rows.filter((r) => r.is_default).map((r) => r.id)).toEqual(["open"]);
    expect(rows.filter((r) => r.show_on_roadmap)).toHaveLength(3);
  });

  it("derives keys for rows saved before the key was filled", () => {
    expect(statusRows([{ name: "Needs Info", type: "active" }])[0]?.id).toBe(
      "needs-info",
    );
    expect(tagRows([{ name: "UX / UI" }])[0]?.id).toBe("ux-ui");
  });
});

describe("shared helpers", () => {
  it("slugify mirrors SQL mod_feedback_slugify", () => {
    expect(slugify("  Dark mode — for iOS!! ")).toBe("dark-mode-for-ios");
    expect(slugify("???")).toBe("item");
    expect(slugify("a".repeat(100))).toHaveLength(80);
  });

  it("effectiveAnon: board rule wins, inherit uses the global default", () => {
    expect(effectiveAnon("allow", false)).toBe(true);
    expect(effectiveAnon("deny", true)).toBe(false);
    expect(effectiveAnon("inherit", true)).toBe(true);
    expect(effectiveAnon(null, false)).toBe(false);
  });
});

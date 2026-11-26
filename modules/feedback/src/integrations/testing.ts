import { describe, expect, it } from "vitest";

import type { IssueTrackerProvider, ProviderContext } from "./types";
import { STATE_CATEGORIES } from "./types";

/**
 * The provider contract, as a reusable vitest suite. Adapter modules run it
 * against their provider with a fake of their tool's API:
 *
 *   runProviderContractTests(myProvider, () => makeFakeContext());
 *
 * `makeContext` must return a fresh context whose fake holds at least one
 * open issue with externalId "1".
 */
export function runProviderContractTests(
  provider: IssueTrackerProvider,
  makeContext: () => ProviderContext,
): void {
  describe(`${provider.id} provider contract`, () => {
    it("reports its connection status", async () => {
      const status = await provider.status(makeContext());
      expect(typeof status.connected).toBe("boolean");
    });

    it("gets an issue with a shared state category", async () => {
      const issue = await provider.get(makeContext(), "1");
      expect(issue.externalId).toBe("1");
      expect(issue.provider).toBe(provider.id);
      expect(STATE_CATEGORIES).toContain(issue.state.category);
      expect(issue.url).toMatch(/^https?:\/\//);
    });

    it("setState is idempotent", async () => {
      const ctx = makeContext();
      expect(await provider.setState(ctx, "1", "completed")).toBe(true);
      expect(await provider.setState(ctx, "1", "completed")).toBe(false);
      expect((await provider.get(ctx, "1")).state.category).toBe("completed");
      expect(await provider.setState(ctx, "1", "unstarted")).toBe(true);
      expect((await provider.get(ctx, "1")).state.category).toBe("unstarted");
    });

    it("creates issues", async () => {
      const ctx = makeContext();
      const issue = await provider.create(ctx, {
        title: "From feedback",
        body: "…",
        labels: [],
      });
      expect(issue.title).toBe("From feedback");
      expect((await provider.get(ctx, issue.externalId)).externalId).toBe(
        issue.externalId,
      );
    });

    it("upserts one back-link comment", async () => {
      const ctx = makeContext();
      const first = await provider.upsertBacklink(ctx, "1", "linked");
      const again = await provider.upsertBacklink(
        ctx,
        "1",
        "linked (updated)",
        first.commentId,
      );
      expect(again.commentId).toBe(first.commentId);
    });

    if (provider.pollChanged) {
      it("polls only the requested issues and advances the cursor", async () => {
        const ctx = makeContext();
        const created = await provider.create(ctx, {
          title: "Other",
          body: "",
          labels: [],
        });
        const res = await provider.pollChanged?.(ctx, null, ["1"]);
        expect(res?.issues.map((i) => i.externalId)).toEqual(["1"]);
        expect(res?.cursor).toBeTruthy();
        expect(
          res?.issues.some((i) => i.externalId === created.externalId),
        ).toBe(false);
      });
    }
  });
}

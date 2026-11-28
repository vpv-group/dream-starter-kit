import { describe, expect, it } from "vitest";

import { GENERATED_PREFIX } from "../generate";
import { MOD_PATHS } from "../paths";
import { isRouteGroupPath, unverifiedRouteFiles } from "./route-stubs";

const pub = `${MOD_PATHS.nextPublicGroup}/feedback/page.tsx`;
const embed = `${MOD_PATHS.nextEmbedGroup}/embed/feedback/layout.tsx`;
const app = `${MOD_PATHS.nextAppGroup}/a/feedback/page.tsx`;
const stub = `${GENERATED_PREFIX}export { FeedbackPage as default } from "@acme/mod-feedback/web-server";\n`;

const check = (
  changed: string[],
  files: Record<string, string | null>,
  head: Record<string, string> = {},
) =>
  unverifiedRouteFiles({
    changed,
    expected: new Map([
      [pub, stub],
      [embed, stub],
      [app, stub],
    ]),
    read: (p) => files[p] ?? null,
    readHead: (p) => head[p] ?? null,
  });

describe("unverifiedRouteFiles", () => {
  it("accepts pages exactly as mod sync generates them, in every group", () => {
    expect(
      check([pub, embed, app], { [pub]: stub, [embed]: stub, [app]: stub }),
    ).toEqual([]);
  });

  it("rejects a route file that differs from the generated one", () => {
    expect(check([pub], { [pub]: `${stub}console.log("hi");\n` })).toEqual([
      pub,
    ]);
  });

  it("rejects a route file mod sync wouldn't generate at all", () => {
    const extra = `${MOD_PATHS.nextPublicGroup}/feedback/extra.tsx`;
    expect(check([extra], { [extra]: stub })).toEqual([extra]);
  });

  it("allows deleting a generated stub, not a hand-written page", () => {
    const own = `${MOD_PATHS.nextPublicGroup}/about/page.tsx`;
    expect(
      check([pub, own], {}, { [pub]: stub, [own]: "export default 1;\n" }),
    ).toEqual([own]);
  });

  it("passes other paths through untouched", () => {
    expect(check(["apps/nextjs/src/proxy.ts"], {})).toEqual([
      "apps/nextjs/src/proxy.ts",
    ]);
    expect(
      isRouteGroupPath("apps/nextjs/src/app/(payload)/admin/page.tsx"),
    ).toBe(false);
  });
});

/**
 * The founder's /cms-setup steps, in order (docs/MODULES.md → Automatic
 * updates). Pure, so the numbering rules are unit tested (steps.test.ts):
 * a step that doesn't apply is skipped silently and the "01 / 04" eyebrow
 * counts only the steps that do.
 */

export type SetupStepKey =
  "account-model" | "content" | "connect-code" | "app-updates" | "services";

export interface SetupContext {
  /** The account model hasn't been chosen yet. */
  askAccountModel: boolean;
  /**
   * The site will register with Meet Dream after the seed (a public domain,
   * telemetry on), so the GitHub steps can follow. False on localhost.
   */
  updatesAvailable: boolean;
  /** GitHub is already connected (e.g. through meetdream.com/start). */
  githubConnected: boolean;
}

const ORDER: { key: SetupStepKey; applies: (ctx: SetupContext) => boolean }[] =
  [
    { key: "account-model", applies: (ctx) => ctx.askAccountModel },
    { key: "content", applies: () => true },
    {
      key: "connect-code",
      applies: (ctx) => ctx.updatesAvailable && !ctx.githubConnected,
    },
    { key: "app-updates", applies: (ctx) => ctx.updatesAvailable },
    // Host and database checks (lib/setup/services-core.ts): only on a
    // public deployment, where they can be wrong.
    { key: "services", applies: (ctx) => ctx.updatesAvailable },
  ];

export function setupSteps(ctx: SetupContext): SetupStepKey[] {
  return ORDER.filter((s) => s.applies(ctx)).map((s) => s.key);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The eyebrow for `key` ("02" of "04"), or null when it doesn't apply. */
export function stepPosition(
  key: SetupStepKey,
  ctx: SetupContext,
): { index: string; total: string } | null {
  const steps = setupSteps(ctx);
  const i = steps.indexOf(key);
  return i < 0 ? null : { index: pad(i + 1), total: pad(steps.length) };
}

/**
 * Sizing for Payload's Postgres pool (payload.config.ts → `db.pool`).
 *
 * The SERVER sizing is deliberately tiny and fails fast — see the comment
 * above `pool:` in payload.config.ts for why (Vercel cold-start bursts on the
 * shared pooler, and starvation must fail instead of riding out the 300s
 * function timeout). Do not change it to fix a local tooling problem.
 *
 * The CLI sizing applies only to the one-shot Node scripts (`pnpm cms:seed`,
 * `pnpm cms:backfill-users`), which mark themselves via
 * `scripts/mark-cli-process.mjs`. In dev those scripts boot Payload with
 * schema `push` on, and drizzle-kit's push introspection fires one concurrent
 * query chain PER TABLE (the `cms` schema has ~190 tables). On a 2-connection
 * pool with a 15s acquire timeout the tail of that queue times out
 * ("timeout exceeded when trying to connect"). A single local process can
 * afford a wider pool and a longer acquire wait; a dead database still fails.
 */
export interface CmsPoolSizing {
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

export const SERVER_POOL_SIZING: CmsPoolSizing = {
  max: 2,
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 15_000,
};

export const CLI_POOL_SIZING: CmsPoolSizing = {
  max: 10,
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 120_000,
};

/** Env marker set by `scripts/mark-cli-process.mjs` for the CMS CLI scripts. */
export const CMS_CLI_PROCESS_ENV = "CMS_CLI_PROCESS";

export function cmsPoolSizing({ cli }: { cli: boolean }): CmsPoolSizing {
  return { ...(cli ? CLI_POOL_SIZING : SERVER_POOL_SIZING) };
}

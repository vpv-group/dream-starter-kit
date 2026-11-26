/**
 * The cron bearer secret (explicit CRON_SECRET, else derived from the
 * service-role key) lives in @acme/mod-kit/cron so the host and module cron
 * routes share one implementation. See that file for the details.
 */
export type { CronSecretSource } from "@acme/mod-kit/cron";
export {
  deriveCronSecret,
  isCronAuthorized,
  resolveCronSecret,
} from "@acme/mod-kit/cron";

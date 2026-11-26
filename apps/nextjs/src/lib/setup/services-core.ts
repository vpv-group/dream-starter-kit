/**
 * "Finish connecting your services" (/cms-setup/services and
 * /api/health/setup): what this deployment still needs from its host and
 * database. Pure, so services-core.test.ts pins it; the route feeds it the
 * env and Meet Dream's connection state.
 */

export type ServiceStatus = "done" | "needs-you";

export interface ServiceCheck {
  key: "site-url" | "storage" | "cron" | "auth";
  title: string;
  status: ServiceStatus;
  /** What to do when it needs you. */
  hint: string;
  /** "Fix" runs this connection on meetdream.com (backend adapter). */
  fix?: { kind: "backend"; provider: "supabase" };
}

export interface ServiceInput {
  /** The public URL the app resolved (getSiteUrl). */
  siteUrl: string;
  env: { CRON_SECRET?: string };
  /** Uploads work (S3 keys, or Supabase session-token mode — s3-config.ts). */
  storageConfigured: boolean;
  /** Meet Dream configured Supabase Auth for this site (backend connection). */
  authConfigured: boolean;
  /** Meet Dream can run the Supabase connection (OAuth app set up there). */
  canFixAuth: boolean;
}

function isLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")
    );
  } catch {
    return true;
  }
}

export function serviceChecks(input: ServiceInput): ServiceCheck[] {
  const { env } = input;
  return [
    {
      key: "site-url",
      title: "Your site's address",
      status: isLocal(input.siteUrl) ? "needs-you" : "done",
      hint: "Set NEXT_PUBLIC_SITE_URL to your domain in your host's environment settings.",
    },
    {
      key: "auth",
      title: "Sign-in links and emails",
      status: input.authConfigured ? "done" : "needs-you",
      hint: "Supabase needs your site's address, redirect links and the kit's email templates.",
      ...(input.authConfigured || !input.canFixAuth
        ? {}
        : { fix: { kind: "backend", provider: "supabase" } as const }),
    },
    {
      key: "storage",
      title: "File uploads",
      status: input.storageConfigured ? "done" : "needs-you",
      hint: "Uploads use Supabase Storage with your service key. Set SUPABASE_SERVICE_ROLE_KEY (or the S3_* keys) in your host's environment settings.",
    },
    {
      key: "cron",
      title: "Scheduled jobs",
      status: env.CRON_SECRET ? "done" : "needs-you",
      hint: "Set CRON_SECRET so scheduled notifications and the daily license report run.",
    },
  ];
}

export function allDone(checks: ServiceCheck[]): boolean {
  return checks.every((c) => c.status === "done");
}

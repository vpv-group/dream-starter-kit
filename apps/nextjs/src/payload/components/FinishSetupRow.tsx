import type { ServerProps } from "payload";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { getUpdates } from "~/lib/mod/updates";

/**
 * Top of the /admin dashboard (Payload `beforeDashboard`): one compact row
 * until GitHub is connected, linking to /admin/updates. Admins only; renders
 * nothing once connected, when the site hasn't registered with Meet Dream
 * (localhost, DREAM_TELEMETRY=off) or when Meet Dream can't be reached.
 */
export async function FinishSetupRow({ user }: ServerProps) {
  const roles = (user as { roles?: string[] } | undefined)?.roles ?? [];
  if (!roles.includes("admin")) return null;
  const updates = await getUpdates();
  if (updates.status !== "ok" || updates.connected) return null;
  return (
    <Link
      href="/admin/updates"
      className="bg-card hover:bg-accent mb-6 flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm no-underline"
    >
      <span>
        <strong>Finish setup</strong>
        <span className="text-muted-foreground">
          {" "}
          · Connect GitHub so the starter kit and your modules keep themselves
          up to date
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0" aria-hidden />
    </Link>
  );
}

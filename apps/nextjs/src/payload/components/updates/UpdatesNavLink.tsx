import type { ServerProps } from "payload";
import Link from "next/link";

/**
 * "Updates" in the admin sidebar (`afterNavLinks`), for admins: kit and
 * module updates, automatic merging, and the GitHub connection.
 */
export function UpdatesNavLink({ user }: ServerProps) {
  const roles = (user as { roles?: string[] } | undefined)?.roles ?? [];
  if (!roles.includes("admin")) return null;
  return (
    <Link className="nav__link" href="/admin/updates" id="nav-updates">
      <span className="nav__link-label">Updates</span>
    </Link>
  );
}

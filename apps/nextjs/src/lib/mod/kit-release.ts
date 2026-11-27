import "server-only";

/**
 * The newest PUBLISHED Dream Starter Kit release, for the /admin "Updates
 * available" banner. module-ops.yml's kit-update job merges the same thing
 * (the newest stable vX.Y.Z release, never main), so the banner never offers
 * a kit version the workflow wouldn't merge. GitHub's "latest release" skips
 * drafts and pre-releases. Cached for an hour in Next's data cache, so a busy
 * admin stays far below GitHub's unauthenticated rate limit. Never throws:
 * null means "unknown" and the banner just leaves the kit out.
 */

/** The kit's repository (module-ops.yml's UPSTREAM_URL). */
export const KIT_REPOSITORY = "vpv-group/dream-starter-kit";

export async function latestKitRelease(): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${KIT_REPOSITORY}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "dream-starter-kit",
        },
        next: { revalidate: 3600, tags: ["kit-release"] },
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { tag_name?: unknown };
    return typeof body.tag_name === "string" ? body.tag_name : null;
  } catch {
    return null;
  }
}

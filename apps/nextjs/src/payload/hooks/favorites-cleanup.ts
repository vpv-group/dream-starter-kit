import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionConfig,
} from "payload";

/**
 * Collections members can favorite (public.content_favorites rows keyed by
 * `collection` + `item_id`; see packages/app/src/hooks/use-favorites.ts).
 */
const FAVORITABLE = new Set([
  "posts",
  "videos",
  "audio",
  "photos",
  "locations",
  "events",
]);

async function queueCleanup(
  req: Parameters<CollectionAfterDeleteHook>[0]["req"],
  collection: string,
  itemId: string | number,
): Promise<void> {
  try {
    // Queued with `req`, so the job only exists if the delete/trash commits.
    await req.payload.jobs.queue({
      task: "favorites-cleanup",
      input: { collection, itemId: String(itemId) },
      req,
    });
  } catch (err) {
    req.payload.logger.warn(
      { err, collection, itemId },
      "favorites cleanup: couldn't queue",
    );
  }
}

/**
 * Removes favorites of content that's gone. Fires on permanent delete and on
 * move-to-trash: trashing is an UPDATE that sets `deletedAt`, so it never
 * triggers delete hooks. A restored item's favorites stay removed.
 * The job retries; there is no periodic orphan sweep (a 2.6+ follow-up).
 */
export function withFavoritesCleanup<T extends CollectionConfig>(config: T): T {
  if (!FAVORITABLE.has(config.slug)) return config;
  const afterDelete: CollectionAfterDeleteHook = async ({ id, req }) => {
    await queueCleanup(req, config.slug, id);
  };
  const afterChange: CollectionAfterChangeHook = async ({
    doc,
    previousDoc,
    operation,
    req,
  }) => {
    const current = doc as { id: string | number; deletedAt?: unknown };
    const previous = previousDoc as { deletedAt?: unknown } | undefined;
    const wasTrashed =
      operation === "update" &&
      Boolean(current.deletedAt) &&
      !previous?.deletedAt;
    if (wasTrashed) await queueCleanup(req, config.slug, current.id);
    return current;
  };
  return {
    ...config,
    hooks: {
      ...config.hooks,
      afterChange: [...(config.hooks?.afterChange ?? []), afterChange],
      afterDelete: [...(config.hooks?.afterDelete ?? []), afterDelete],
    },
  };
}

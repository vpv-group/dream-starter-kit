import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  GlobalAfterChangeHook,
} from "payload";

/**
 * Invalidate the cross-request CMS cache (lib/cms/cached-reads.ts) when the
 * data behind it changes. `{ expire: 0 }` drops the entry immediately, so
 * editors see their change on the next request (Next 16's two-argument
 * `revalidateTag`; `updateTag` only works in Server Actions, and Payload's
 * REST API runs in a route handler).
 *
 * Skipped when `context.disableRevalidate` is set, and harmless outside a
 * Next request (CLI seed/migrate): the error is logged, the save goes on.
 */
async function revalidate(
  tags: string[],
  logger: { warn: (msg: string) => void },
  context: Record<string, unknown>,
): Promise<void> {
  if (context.disableRevalidate) return;
  try {
    const { revalidateTag } = await import("next/cache");
    for (const tag of tags) revalidateTag(tag, { expire: 0 });
  } catch (error) {
    logger.warn(
      `[cache] couldn't revalidate ${tags.join(", ")}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export function revalidateGlobalCache(slug: string): GlobalAfterChangeHook {
  return async ({ req, context }) => {
    await revalidate([`global_${slug}`], req.payload.logger, context);
  };
}

export function revalidateCollectionCache(slug: string): {
  afterChange: CollectionAfterChangeHook;
  afterDelete: CollectionAfterDeleteHook;
} {
  const tags = [`collection_${slug}`];
  return {
    afterChange: async ({ req, context }) => {
      await revalidate(tags, req.payload.logger, context);
    },
    afterDelete: async ({ req, context }) => {
      await revalidate(tags, req.payload.logger, context);
    },
  };
}

/** Collections and globals read through lib/cms/cached-reads.ts. */
const CACHED_COLLECTIONS = new Set(["nav-items", "kit-modules"]);
const CACHED_GLOBALS = new Set([
  "theme-settings",
  "authentication-settings",
  "site-settings",
  "native-navigation",
]);

/** Adds the cache-invalidation hooks to a cached collection (else no-op). */
export function withCollectionCacheInvalidation<
  T extends {
    slug: string;
    hooks?: {
      afterChange?: CollectionAfterChangeHook[];
      afterDelete?: CollectionAfterDeleteHook[];
    };
  },
>(config: T): T {
  if (!CACHED_COLLECTIONS.has(config.slug)) return config;
  const hooks = revalidateCollectionCache(config.slug);
  return {
    ...config,
    hooks: {
      ...config.hooks,
      afterChange: [...(config.hooks?.afterChange ?? []), hooks.afterChange],
      afterDelete: [...(config.hooks?.afterDelete ?? []), hooks.afterDelete],
    },
  };
}

/** Adds the cache-invalidation hook to a cached global (else no-op). */
export function withGlobalCacheInvalidation<
  T extends { slug: string; hooks?: { afterChange?: GlobalAfterChangeHook[] } },
>(config: T): T {
  if (!CACHED_GLOBALS.has(config.slug)) return config;
  return {
    ...config,
    hooks: {
      ...config.hooks,
      afterChange: [
        ...(config.hooks?.afterChange ?? []),
        revalidateGlobalCache(config.slug),
      ],
    },
  };
}

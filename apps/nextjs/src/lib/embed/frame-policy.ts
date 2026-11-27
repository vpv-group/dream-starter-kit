/**
 * Framing policy for embeddable module pages (/embed/<slug>/…, manifest
 * `area: "embed"`). proxy.ts answers them with
 * `Content-Security-Policy: frame-ancestors 'self' <origins>`, where the
 * origins are the module's rows in `public.kit_embed_origins` (edited by
 * staff in the module's /admin settings). No rows → only the app itself may
 * frame the page. Lookups fail closed and are cached per instance.
 */

const SLUG_RE = /^[a-z][a-z0-9-]{1,30}$/;
const ORIGIN_RE =
  /^(https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?|http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?)$/;

/** The module slug for an /embed/<slug>… path, else null. */
export function embedSlug(pathname: string): string | null {
  const m = /^\/embed\/([^/]+)(?:\/|$)/.exec(pathname);
  const slug = m?.[1];
  return slug && SLUG_RE.test(slug) ? slug : null;
}

/** The CSP value; origins are re-validated so nothing odd reaches a header. */
export function frameAncestors(origins: string[]): string {
  const safe = origins.filter((o) => ORIGIN_RE.test(o));
  return ["frame-ancestors", "'self'", ...safe].join(" ");
}

export type OriginFetcher = (slug: string) => Promise<string[]>;

const TTL_MS = 60_000;

/** Cache module origins per instance; errors cache as "none" briefly. */
export function cachedOrigins(fetcher: OriginFetcher, now = () => Date.now()) {
  const cache = new Map<string, { at: number; origins: string[] }>();
  return async (slug: string): Promise<string[]> => {
    const hit = cache.get(slug);
    if (hit && now() - hit.at < TTL_MS) return hit.origins;
    let origins: string[];
    try {
      origins = await fetcher(slug);
    } catch {
      origins = [];
    }
    cache.set(slug, { at: now(), origins });
    return origins;
  };
}

/** PostgREST read with the anon key (the table is world-readable). */
export function restOriginFetcher(
  supabaseUrl: string,
  anonKey: string,
): OriginFetcher {
  return async (slug) => {
    const url = `${supabaseUrl}/rest/v1/kit_embed_origins?select=origin&module=eq.${encodeURIComponent(slug)}`;
    const res = await fetch(url, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) throw new Error(`kit_embed_origins ${res.status}`);
    const rows = (await res.json()) as { origin: string }[];
    return rows.map((r) => r.origin);
  };
}

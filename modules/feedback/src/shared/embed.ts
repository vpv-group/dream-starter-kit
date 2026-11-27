/** Origins a framing site may have (matches kit_embed_origins' check). */
const ORIGIN_RE =
  /^(https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?|http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?)$/;

/**
 * Parse the Widget tab's "allowed sites" textarea: one origin per line (or
 * comma-separated), lower-cased, trailing slashes and paths dropped.
 * Returns the valid origins and the lines that aren't.
 */
export function parseEmbedOrigins(raw: string | null | undefined): {
  origins: string[];
  invalid: string[];
} {
  const origins = new Set<string>();
  const invalid: string[] = [];
  for (const line of (raw ?? "").split(/[\n,]/)) {
    const value = line.trim().toLowerCase();
    if (!value) continue;
    let origin = value;
    try {
      origin = new URL(value).origin;
    } catch {
      // keep as typed; the regex rejects it
    }
    if (ORIGIN_RE.test(origin)) origins.add(origin);
    else invalid.push(line.trim());
  }
  return { origins: [...origins], invalid };
}

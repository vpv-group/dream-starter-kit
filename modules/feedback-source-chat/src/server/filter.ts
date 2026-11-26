/** Phrases that suggest a chat message is product feedback. */
export const DEFAULT_KEYWORDS = [
  "feature",
  "would be nice",
  "would be great",
  "wish",
  "please add",
  "can you add",
  "could you add",
  "should be able",
  "bug",
  "broken",
  "doesn't work",
  "does not work",
  "not working",
  "missing",
  "suggestion",
  "feedback",
];

export function parseKeywords(raw: string | null | undefined): string[] {
  const list = (raw ?? "")
    .split(/[,\n]/)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : DEFAULT_KEYWORDS;
}

/** Cheap prefilter before Autopilot's AI classifier sees the message. */
export function looksLikeFeedback(
  text: string,
  keywords: string[],
  minLength: number,
): boolean {
  const t = text.trim().toLowerCase();
  if (t.length < minLength) return false;
  return keywords.some((k) => t.includes(k));
}

import { z } from "zod/v4";

/** Normalise a website input: blank → undefined, missing scheme → https. */
export function normalizeWebsite(
  input: string | undefined,
): string | undefined {
  const v = (input ?? "").trim();
  if (!v) return undefined;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/** The registrable-ish host of a website ("https://www.acme.com/x" → "acme.com"). */
export function websiteDomain(input: string | null | undefined): string | null {
  const url = normalizeWebsite(input ?? undefined);
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Create-organization form (onboarding + switcher). */
export const organizationSchema = z.object({
  name: z.string().trim().min(1, "Enter your organization's name").max(120),
  website: z
    .string()
    .trim()
    .max(255)
    .optional()
    .refine((v) => !v || websiteDomain(v) !== null, "Enter a valid website"),
});
export type OrganizationInput = z.infer<typeof organizationSchema>;

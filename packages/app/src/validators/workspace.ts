import { z } from "zod/v4";

import {
  RESERVED_WORKSPACE_SLUGS,
  slugProblemMessage,
  WORKSPACE_SLUG_RE,
} from "../workspaces";

export const workspaceNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name")
  .max(64, "Use 64 characters or fewer");

export const workspaceSlugSchema = z
  .string()
  .regex(WORKSPACE_SLUG_RE, slugProblemMessage("format"))
  .refine(
    (s) => !RESERVED_WORKSPACE_SLUGS.includes(s),
    slugProblemMessage("reserved"),
  );

/** "Name your workspace" form. Availability is checked server-side. */
export const createWorkspaceSchema = z.object({
  name: workspaceNameSchema,
  slug: workspaceSlugSchema,
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

/** Onboarding "Set up your profile" step. */
export const profileStepSchema = z.object({
  displayName: z.string().trim().min(1, "Enter your name").max(80),
  title: z.string().trim().max(80, "Use 80 characters or fewer"),
  avatarUrl: z.string().nullable().optional(),
});
export type ProfileStepInput = z.infer<typeof profileStepSchema>;

/** Onboarding "Stay in the loop" step (profiles.email_preferences). */
export const emailPreferencesSchema = z.object({
  tips: z.boolean(),
  product_updates: z.boolean(),
});
export type EmailPreferences = z.infer<typeof emailPreferencesSchema>;

export const DEFAULT_EMAIL_PREFERENCES: EmailPreferences = {
  tips: true,
  product_updates: false,
};

/** Read stored preferences, filling defaults for anything missing or malformed. */
export function readEmailPreferences(raw: unknown): EmailPreferences {
  const parsed = emailPreferencesSchema.partial().safeParse(raw);
  return {
    ...DEFAULT_EMAIL_PREFERENCES,
    ...(parsed.success ? parsed.data : {}),
  };
}

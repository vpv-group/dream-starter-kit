import { z } from "zod/v4";

export const emailSchema = z.email("Enter a valid email");

/** Default minimum password length, mirrored by the auth-settings global. */
export const DEFAULT_MIN_PASSWORD_LENGTH = 8;

/** Password schema for a given minimum length (driven by the auth-settings global). */
export const makePasswordSchema = (min: number = DEFAULT_MIN_PASSWORD_LENGTH) =>
  z.string().min(min, `Use at least ${min} characters`);

export const passwordSchema = makePasswordSchema();

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});
export type SignInInput = z.infer<typeof signInSchema>;

/**
 * Sign-up schema, parameterized by the front-end auth-settings global's minimum
 * password length. Terms acceptance + email-domain rules are enforced in the UI
 * (they depend on runtime settings, not a static schema). The static
 * {@link signUpSchema} below is the default (8 chars) kept for back-compat.
 */
export const makeSignUpSchema = ({
  minPasswordLength = DEFAULT_MIN_PASSWORD_LENGTH,
}: { minPasswordLength?: number } = {}) =>
  z.object({
    email: emailSchema,
    password: makePasswordSchema(minPasswordLength),
    displayName: z.string().min(1, "Name is required").max(80).optional(),
  });

export const signUpSchema = makeSignUpSchema();
export type SignUpInput = z.infer<typeof signUpSchema>;

export const magicLinkSchema = z.object({ email: emailSchema });
export type MagicLinkInput = z.infer<typeof magicLinkSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Contact phone number (stored in `profiles.phone` / the CMS `phone` field —
 * NOT a Supabase Auth phone identity, so no SMS/OTP is involved). Loose
 * international format: optional leading `+`, digits and common separators.
 * `""` means "clear it".
 */
export const PHONE_PATTERN = /^\+?[0-9 ().-]{7,20}$/;
export const phoneSchema = z.union([
  z
    .string()
    .trim()
    .regex(PHONE_PATTERN, "Enter a valid phone number")
    .refine((v) => v.replace(/\D/g, "").length >= 7, {
      message: "Enter a valid phone number",
    }),
  z.literal(""),
]);

export const updateProfileSchema = z.object({
  displayName: z.string().min(1, "Name is required").max(80),
  avatarUrl: z.union([z.url("Enter a valid URL"), z.literal("")]).optional(),
  title: z.string().trim().max(80, "Use at most 80 characters").optional(),
  phone: phoneSchema.optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** Request an email change (Supabase sends confirmations — see docs/AUTH.md). */
export const changeEmailSchema = z.object({ email: emailSchema });
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

/**
 * Change-password form, parameterized by the auth-settings global's minimum
 * password length (pass `useAuthConfig().data.minPasswordLength`).
 */
export const makeChangePasswordSchema = (
  min: number = DEFAULT_MIN_PASSWORD_LENGTH,
) =>
  z
    .object({
      password: makePasswordSchema(min),
      confirmPassword: z.string(),
    })
    .refine((d) => d.password === d.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    });
export type ChangePasswordInput = z.infer<
  ReturnType<typeof makeChangePasswordSchema>
>;

/** The 6-digit reauthentication code Supabase emails (the `nonce`). */
export const reauthCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
});
export type ReauthCodeInput = z.infer<typeof reauthCodeSchema>;

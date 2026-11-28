import type { GlobalConfig } from "payload";

import { anyone, isStaff } from "../access";

/**
 * Front-end authentication configuration (System → Authentication). Staff pick a
 * default sign-in method and toggle which methods the sign-up / sign-in /
 * forgot-password UIs offer, plus sign-up access rules, password strength, copy,
 * and SAML SSO routing.
 *
 * IMPORTANT — this is a PRESENTATION + CLIENT-LOGIC layer, not the source of
 * truth for what auth actually works. Supabase's GoTrue server (config.toml /
 * the hosted dashboard) is what truly enables a provider, signup, captcha or
 * SAML; our app reads this global at request time to decide which UI to render
 * and which client-side rules to apply. Each method that needs a matching
 * Supabase setting carries an inline note linking to docs/AUTH.md. We do NOT
 * call the Supabase Management API.
 *
 * Read access is `anyone` (the public sign-in pages and the mobile
 * /api/auth/config endpoint must read it; it holds no secrets); updates are
 * staff-only. Read server-side via `getAuthSettings()` in lib/payload.ts.
 */

/** Where the inline admin notes link for per-method Supabase prerequisites. */
const DOCS_AUTH =
  "https://github.com/vpv-group/dream-starter-kit/blob/main/docs/AUTH.md";

export const AuthenticationSettings: GlobalConfig = {
  slug: "authentication-settings",
  label: "Authentication",
  admin: {
    group: "System",
    description:
      "Choose the default sign-in method and which methods the auth screens " +
      "offer, plus sign-up access rules and copy. This controls the UI and " +
      "client logic only — each method must also be enabled in Supabase. " +
      `Setup guide: ${DOCS_AUTH}`,
  },
  access: { read: anyone, update: isStaff },
  hooks: {
    // Record the first explicit choice of account model, so the founder's
    // /cms-setup picker (wireframe AccountModel) is shown exactly once. A save
    // in /admin that changes the model counts as choosing it.
    beforeChange: [
      ({ data, originalDoc }) => {
        const prev = (originalDoc ?? {}) as {
          accountModel?: string | null;
          accountModelChosenAt?: string | null;
        };
        const next = data as {
          accountModel?: string | null;
          accountModelChosenAt?: string | null;
        };
        if (
          !next.accountModelChosenAt &&
          !prev.accountModelChosenAt &&
          next.accountModel &&
          next.accountModel !== (prev.accountModel ?? "consumer")
        ) {
          next.accountModelChosenAt = new Date().toISOString();
        }
        return next;
      },
    ],
  },
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          label: "Account model",
          description:
            "Who signs up for your app. Individuals keeps today's sign-up. " +
            "Teams puts every user in a shared workspace with invites and a " +
            "member list. Both lets each person choose. The model only changes " +
            "the UI and routing; it never changes database access rules. See " +
            "docs/WORKSPACES.md.",
          fields: [
            {
              name: "accountModel",
              type: "radio",
              defaultValue: "consumer",
              options: [
                { label: "Individuals", value: "consumer" },
                { label: "Teams and companies", value: "business" },
                { label: "Both", value: "hybrid" },
              ],
              admin: {
                layout: "vertical",
                description:
                  "Switching Teams → Individuals keeps all workspace data but " +
                  "hides it. Switching Individuals → Teams sends existing " +
                  "members to “Name your workspace” on their next sign-in.",
              },
            },
            {
              // Set once by the founder's /cms-setup picker or the first
              // change of accountModel here (see hooks.beforeChange).
              name: "accountModelChosenAt",
              type: "date",
              admin: {
                readOnly: true,
                hidden: true,
              },
            },
            {
              type: "row",
              admin: { condition: (data) => data.accountModel !== "consumer" },
              fields: [
                {
                  name: "workspaceLabel",
                  type: "select",
                  defaultValue: "Workspace",
                  options: [
                    "Workspace",
                    "Organization",
                    "Team",
                    "Studio",
                    "Practice",
                  ],
                  admin: {
                    width: "50%",
                    description: "What a shared space is called everywhere.",
                  },
                },
                {
                  name: "workspaceUrlPrefix",
                  label: "Workspace URL Prefix",
                  type: "text",
                  admin: {
                    width: "50%",
                    placeholder: "app.example.com/",
                    description:
                      "Shown before the URL field. Blank uses your site's host.",
                  },
                },
              ],
            },
            {
              type: "row",
              admin: { condition: (data) => data.accountModel !== "consumer" },
              fields: [
                {
                  name: "inviteExpiryDays",
                  type: "number",
                  defaultValue: 7,
                  min: 1,
                  max: 30,
                  admin: {
                    width: "50%",
                    step: 1,
                    description: "Days before an emailed invite expires.",
                  },
                },
                {
                  name: "allowInviteLinks",
                  type: "checkbox",
                  defaultValue: true,
                  admin: {
                    width: "50%",
                    description:
                      "Let workspace admins share a join link. They can still " +
                      "turn their own link off.",
                  },
                },
              ],
            },
            {
              name: "onboardingSteps",
              type: "array",
              labels: { singular: "Step", plural: "Onboarding steps" },
              // Mirrors DEFAULT_ONBOARDING_STEPS in @acme/app (auth-settings.ts).
              defaultValue: [
                { step: "profile", enabled: true },
                { step: "invite", enabled: true },
                { step: "integrations", enabled: true },
                { step: "updates", enabled: true },
                { step: "plan", enabled: false },
              ],
              admin: {
                condition: (data) => data.accountModel !== "consumer",
                description:
                  "The skippable welcome steps after a workspace is created. " +
                  "Drag to reorder, toggle to show or hide. Invited members " +
                  "only see Profile and Updates.",
              },
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "step",
                      type: "select",
                      required: true,
                      options: [
                        { label: "Set up your profile", value: "profile" },
                        { label: "Invite your team", value: "invite" },
                        { label: "Connect apps", value: "integrations" },
                        { label: "Stay in the loop", value: "updates" },
                        { label: "Choose a plan", value: "plan" },
                      ],
                      admin: { width: "60%" },
                    },
                    {
                      name: "enabled",
                      type: "checkbox",
                      defaultValue: false,
                      admin: { width: "40%" },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: "Methods",
          description:
            "Drag to reorder and toggle the methods the sign-in / sign-up " +
            "screens offer. The FIRST enabled method is the primary " +
            "call-to-action (the filled button); the rest appear below it. The " +
            "three email methods (password / magic link / code) collapse into a " +
            "single “Continue with email” button positioned at the " +
            "first enabled one. Per-method Supabase prerequisites: " +
            `${DOCS_AUTH}.`,
          fields: [
            {
              name: "loginMethods",
              type: "array",
              labels: { singular: "Method", plural: "Login methods" },
              // Mirrors DEFAULT_LOGIN_METHODS in @acme/app (auth-settings.ts):
              // magic link leads (default sign-in sends a magic link).
              defaultValue: [
                { method: "magicLink", enabled: true },
                { method: "emailOtp", enabled: true },
                { method: "password", enabled: true },
                { method: "google", enabled: false },
                { method: "apple", enabled: false },
                { method: "sso", enabled: false },
              ],
              admin: {
                description:
                  "Drag the handle to reorder. Toggle Enabled to show/hide. " +
                  "Google/Apple need the provider enabled in Supabase; SAML SSO " +
                  "needs [auth.sso] + a registered identity provider.",
              },
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "method",
                      type: "select",
                      required: true,
                      options: [
                        { label: "Email + password", value: "password" },
                        { label: "Magic link", value: "magicLink" },
                        { label: "Email code (OTP)", value: "emailOtp" },
                        { label: "Google", value: "google" },
                        { label: "Apple", value: "apple" },
                        { label: "SAML 2.0 SSO", value: "sso" },
                      ],
                      admin: { width: "60%" },
                    },
                    {
                      name: "enabled",
                      type: "checkbox",
                      defaultValue: false,
                      admin: { width: "40%" },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: "Sign-up & access",
          fields: [
            {
              name: "allowSignups",
              type: "checkbox",
              defaultValue: true,
              admin: {
                description:
                  "When off, public sign-up is hidden and the sign-up route is " +
                  "blocked (invite-only). For hard server enforcement also set " +
                  `enable_signup = false in Supabase — see ${DOCS_AUTH}#invite-only.`,
              },
            },
            {
              name: "emailDomainMode",
              type: "select",
              defaultValue: "off",
              options: [
                { label: "No restriction", value: "off" },
                { label: "Allow only these domains", value: "allowlist" },
                { label: "Block these domains", value: "blocklist" },
              ],
              admin: {
                description:
                  "Restrict which email domains may sign up (checked client-" +
                  "side and in the sign-up/checkout server route).",
              },
            },
            {
              name: "emailDomains",
              type: "array",
              labels: { singular: "Domain", plural: "Domains" },
              admin: {
                condition: (data) => data.emailDomainMode !== "off",
                description: "Bare domains, e.g. acme.com (no @ or scheme).",
              },
              fields: [
                {
                  name: "domain",
                  type: "text",
                  required: true,
                  admin: { placeholder: "acme.com" },
                },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "termsUrl",
                  label: "Terms URL",
                  type: "text",
                  defaultValue: "/legal/terms-of-service",
                  admin: {
                    width: "50%",
                    description: "Terms of Service link in the sign-up footer.",
                  },
                },
                {
                  name: "privacyUrl",
                  label: "Privacy URL",
                  type: "text",
                  defaultValue: "/legal/privacy-policy",
                  admin: {
                    width: "50%",
                    description: "Privacy Policy link in the sign-up footer.",
                  },
                },
              ],
            },
            {
              name: "requireTermsAcceptance",
              type: "checkbox",
              defaultValue: false,
              admin: {
                description:
                  "Require an explicit 'I agree' checkbox before sign-up.",
              },
            },
            {
              type: "row",
              fields: [
                {
                  name: "postLoginRedirect",
                  type: "text",
                  admin: {
                    width: "50%",
                    description:
                      "Where users land after login. Blank keeps the default " +
                      "role-based routing (/welcome → /a or the CMS).",
                  },
                },
                {
                  name: "postSignupRedirect",
                  type: "text",
                  admin: {
                    width: "50%",
                    description:
                      "Where users land right after sign-up. Blank keeps the " +
                      "default (/welcome).",
                  },
                },
              ],
            },
          ],
        },
        {
          label: "Security",
          fields: [
            {
              name: "minPasswordLength",
              type: "number",
              defaultValue: 8,
              min: 6,
              max: 72,
              admin: {
                step: 1,
                description:
                  "Minimum password length enforced in the UI. Must be ≥ " +
                  "Supabase's server-side minimum_password_length to be " +
                  `enforced end-to-end — see ${DOCS_AUTH}#passwords.`,
              },
            },
            {
              name: "requireCaptcha",
              type: "checkbox",
              defaultValue: false,
              label: "Require Cloudflare Turnstile",
              admin: {
                description:
                  "Require a Turnstile token on auth actions. Needs the site " +
                  "key configured and Supabase [auth.captcha] enabled — see " +
                  `${DOCS_AUTH}#captcha and docs/TURNSTILE.md.`,
              },
            },
          ],
        },
        {
          label: "Appearance",
          fields: [
            {
              name: "signInHeading",
              type: "text",
              admin: {
                description:
                  "Heading on the sign-in screen. Blank uses the app name.",
              },
            },
            {
              name: "signUpHeading",
              type: "text",
              admin: {
                description:
                  "Heading on the sign-up screen. Blank uses the app name.",
              },
            },
            {
              name: "subtitle",
              type: "text",
              admin: {
                description: "Optional subtitle shown under the heading.",
              },
            },
          ],
        },
        {
          label: "SSO",
          description:
            "SAML 2.0 single sign-on. This screen only surfaces the entry " +
            "point and routes by email domain — SAML must be enabled in " +
            `Supabase and the identity provider registered. See ${DOCS_AUTH}#sso.`,
          fields: [
            {
              name: "ssoButtonLabel",
              type: "text",
              defaultValue: "Continue with SAML SSO",
            },
            {
              name: "ssoDomains",
              type: "array",
              labels: { singular: "SSO domain", plural: "SSO domains" },
              admin: {
                description:
                  "Map email domains to a registered Supabase SSO provider. " +
                  "A user entering an email on one of these domains is routed " +
                  "to that identity provider. Leave providerId blank to let " +
                  "Supabase resolve the provider by domain.",
              },
              fields: [
                {
                  type: "row",
                  fields: [
                    {
                      name: "domain",
                      type: "text",
                      required: true,
                      admin: { width: "50%", placeholder: "acme.com" },
                    },
                    {
                      name: "providerId",
                      label: "Provider ID",
                      type: "text",
                      admin: {
                        width: "50%",
                        placeholder: "(optional Supabase SSO provider UUID)",
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

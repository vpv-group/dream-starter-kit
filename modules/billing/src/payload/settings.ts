import type { Field } from "payload";

import { defineModuleSettings, staffFieldAccess } from "@acme/mod-kit/payload";

import type { BillingTagSettings } from "../server/core/tags";
import { linkField } from "./fields/link";
import { resyncTagsAfterChange } from "./hooks/resync-tags";

/** One billing-tag group: on/off + a name template. */
function tagGroup(
  name: "plan" | "status" | "cycle" | "store",
  label: string,
  template: string,
  description: string,
): Field {
  return {
    name,
    type: "group",
    label,
    admin: { description },
    fields: [
      {
        type: "row",
        fields: [
          {
            name: "enabled",
            type: "checkbox",
            defaultValue: true,
            admin: { width: "25%" },
          },
          {
            name: "template",
            type: "text",
            defaultValue: template,
            admin: { width: "75%" },
          },
        ],
      },
    ],
  };
}

/**
 * Billing's settings (Modules → Billing). Tabs:
 * - Pricing page — what the public /pricing page shows (featured plans, the
 *   Free/Enterprise columns). publicRead: the pricing page and the native app
 *   read it anonymously — never put secrets here.
 * - Tags — the billing tags synced onto members (../server/core/tags.ts).
 * - one tab per payment provider adapter (e.g. Stripe), staff-only
 *   (`defineAdapterSettings` locks adapter tabs even in a public group).
 */
export const settings = defineModuleSettings({
  slug: "billing",
  name: "Billing",
  publicRead: true,
  fields: [
    {
      type: "tabs",
      tabs: [
        {
          // Unnamed: the fields stay where billing 1.x stored them.
          label: "Pricing page",
          description:
            "What the public /pricing page shows. Read anonymously by the " +
            "pricing page and the native app — never put secrets here.",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "heading",
                  type: "text",
                  defaultValue: "Pricing",
                  admin: { width: "50%" },
                },
                {
                  name: "showFreeTier",
                  type: "checkbox",
                  label: "Show Free tier",
                  defaultValue: true,
                  admin: { width: "50%" },
                },
              ],
            },
            {
              name: "subheading",
              type: "textarea",
              defaultValue: "Start free. Upgrade when you're ready.",
            },
            {
              name: "billingToggleDefault",
              type: "radio",
              defaultValue: "monthly",
              options: [
                { label: "Monthly", value: "monthly" },
                { label: "Annual", value: "annual" },
              ],
              admin: {
                description:
                  "Which billing cadence the pricing page preselects.",
              },
            },
            {
              name: "featuredPlans",
              type: "relationship",
              relationTo: "mod-billing-plans",
              hasMany: true,
              maxRows: 3,
              admin: {
                description:
                  "Pick up to three paid plans to feature, in display order. " +
                  "Empty = all active plans by display order.",
              },
            },
            {
              name: "freeTier",
              type: "group",
              label: "Free tier card",
              admin: { condition: (data) => Boolean(data.showFreeTier) },
              fields: [
                { name: "name", type: "text", defaultValue: "Free" },
                {
                  name: "description",
                  type: "textarea",
                  defaultValue: "Everything you need to get started.",
                },
                {
                  name: "ctaLabel",
                  type: "text",
                  defaultValue: "Get started",
                },
                linkField("link", {
                  description:
                    "Where the Free tier CTA goes (defaults to /sign-up).",
                }),
                {
                  name: "features",
                  type: "array",
                  fields: [
                    { name: "text", type: "text", required: true },
                    { name: "included", type: "checkbox", defaultValue: true },
                  ],
                },
              ],
            },
            {
              name: "showEnterpriseTier",
              type: "checkbox",
              label: "Show Enterprise tier",
              defaultValue: true,
            },
            {
              name: "enterpriseTier",
              type: "group",
              label: "Enterprise tier card",
              admin: {
                condition: (data) => Boolean(data.showEnterpriseTier),
                description:
                  "A non-self-serve “Contact Sales” tier. The CTA points to the link " +
                  "below (e.g. a mailto:, a booking link, or a contact page) — no Stripe.",
              },
              fields: [
                { name: "name", type: "text", defaultValue: "Enterprise" },
                {
                  name: "description",
                  type: "textarea",
                  defaultValue:
                    "Total access for your whole team, billed your way.",
                },
                {
                  name: "ctaLabel",
                  type: "text",
                  defaultValue: "Contact sales",
                },
                linkField("link", {
                  description:
                    "Where the Enterprise CTA goes (e.g. mailto:sales@example.com or /contact).",
                }),
                {
                  name: "features",
                  type: "array",
                  fields: [
                    { name: "text", type: "text", required: true },
                    { name: "included", type: "checkbox", defaultValue: true },
                  ],
                },
              ],
            },
            {
              name: "featuredReview",
              type: "relationship",
              relationTo: "reviews",
              // Only approved reviews can be featured publicly.
              filterOptions: () => ({ status: { equals: "approved" } }),
              admin: {
                description:
                  "Approved review shown as the testimonial on the checkout page " +
                  "(its body, rating, author name/avatar and optional author title).",
              },
            },
            {
              name: "disclaimer",
              type: "textarea",
              admin: {
                description: "Fine print shown under the pricing grid.",
              },
            },
          ],
        },
        {
          label: "Tags",
          description:
            "Billing keeps these tags on every member in step with their " +
            "purchases (all payment providers). They show on the member's " +
            "profile and admin Users page, and work as notification " +
            "audiences. Only tags billing created are changed — staff tags " +
            "are never touched. Renaming a template creates new tags; the old " +
            "ones are unlinked (not deleted), so update notification audiences " +
            "that use them.",
          fields: [
            {
              name: "tags",
              type: "group",
              label: false,
              // Not secret, but not the public pricing page's business.
              access: { read: staffFieldAccess },
              fields: [
                {
                  name: "enabled",
                  type: "checkbox",
                  label: "Sync billing tags",
                  defaultValue: true,
                },
                tagGroup(
                  "plan",
                  "Plan",
                  "{plan}",
                  "The member's active plan(s), e.g. Pro. {plan} = plan name.",
                ),
                tagGroup(
                  "status",
                  "Status",
                  "{status}",
                  "Free, Trialing, Active, Canceling, Past due or Churned.",
                ),
                tagGroup(
                  "cycle",
                  "Billing cycle",
                  "Billing cycle: {cycle}",
                  "Monthly, Annual, Lifetime, …",
                ),
                tagGroup(
                  "store",
                  "Store",
                  "Store: {store}",
                  "Where they bought: Web, App Store, Play Store, Promotional.",
                ),
                {
                  name: "resyncNow",
                  type: "checkbox",
                  label: "Re-sync every member's billing tags on save",
                  defaultValue: false,
                  admin: {
                    description:
                      "Runs once (also daily on its own). Use after changing " +
                      "the names above.",
                  },
                },
                {
                  name: "lastResync",
                  type: "text",
                  admin: { readOnly: true },
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});

settings.global.hooks = {
  ...settings.global.hooks,
  afterChange: [
    ...(settings.global.hooks?.afterChange ?? []),
    resyncTagsAfterChange,
  ],
};

/** The billing settings as stored (only what server code reads is typed). */
export interface BillingSettings extends Record<string, unknown> {
  tags?: (BillingTagSettings & { resyncNow?: boolean | null }) | null;
}

import { defineAdapterSettings } from "@acme/mod-kit/payload";

import { DEFAULT_KEYWORDS } from "../server/filter";

/**
 * A "Chat" tab on the Feedback settings screen (target: feedback). Scalar
 * fields only: they become columns on the settings row.
 */
export const settings = defineAdapterSettings({
  slug: "feedback-source-chat",
  name: "Chat",
  target: "feedback",
  description:
    "Collect feedback from AI chat conversations into the Autopilot inbox.",
  fields: [
    {
      name: "enabled",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description:
          "Scan new chat messages every 15 minutes. Staff will see the matching messages and the sender's email, so mention this in your privacy policy.",
      },
    },
    {
      name: "keywords",
      type: "textarea",
      admin: {
        description: `Only messages containing one of these phrases (comma-separated) are forwarded; Autopilot then decides whether each is feedback. Empty uses the defaults: ${DEFAULT_KEYWORDS.join(", ")}.`,
      },
    },
    {
      name: "minLength",
      type: "number",
      defaultValue: 20,
      min: 1,
      admin: { description: "Ignore messages shorter than this (characters)." },
    },
  ],
});

export interface ChatSourceSettings extends Record<string, unknown> {
  enabled: boolean;
  keywords: string | null;
  minLength: number;
}

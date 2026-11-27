import type { BasePayload } from "payload";

import { getModuleSettings } from "@acme/mod-kit/payload";

import type { BillingSettings } from "../../payload/settings";
import type { BillingTagSettings } from "./tags";
import { settings as billingSettings } from "../../payload/settings";

/** Billing settings → Tags tab (defaults when the CMS is unreachable). */
export async function billingTagSettings(
  getPayload: () => Promise<BasePayload>,
): Promise<BillingTagSettings | null> {
  try {
    const s = await getModuleSettings<BillingSettings>(
      await getPayload(),
      billingSettings,
    );
    return s.tags ?? null;
  } catch {
    return null;
  }
}

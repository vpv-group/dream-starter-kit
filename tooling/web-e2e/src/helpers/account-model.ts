import { request } from "@playwright/test";

import { FOUNDER_STORAGE_STATE } from "./founder";

const baseURL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * Set the site-wide account model as the founder (staff) through Payload's
 * REST global update — the same write path as /admin. Used by the workspaces
 * setup/teardown projects, never by individual specs (the flip is global).
 */
export async function setAccountModel(
  accountModel: "consumer" | "business" | "hybrid",
): Promise<void> {
  const staff = await request.newContext({
    baseURL,
    storageState: FOUNDER_STORAGE_STATE,
  });
  try {
    const res = await staff.post("/cms-api/globals/authentication-settings", {
      data: { accountModel },
    });
    if (!res.ok()) {
      throw new Error(`set accountModel=${accountModel}: HTTP ${res.status()}`);
    }
  } finally {
    await staff.dispose();
  }
}

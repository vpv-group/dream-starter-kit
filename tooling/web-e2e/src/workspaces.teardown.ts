import { existsSync } from "node:fs";
import { test as teardown } from "@playwright/test";

import { setAccountModel } from "./helpers/account-model";
import { FOUNDER_STORAGE_STATE } from "./helpers/founder";

teardown("restore the Individuals account model", async () => {
  // Nothing to restore when the founder setup (and so the flip) never ran.
  teardown.skip(!existsSync(FOUNDER_STORAGE_STATE), "no founder session");
  await setAccountModel("consumer");
});

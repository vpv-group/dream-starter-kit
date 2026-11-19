import { test as setup } from "@playwright/test";

import { setAccountModel } from "./helpers/account-model";

/**
 * Switches the app to Teams for the workspace-*.spec.ts files. Runs after the
 * main suite (it reroutes every sign-up); workspaces.teardown.ts restores
 * Individuals once they finish, pass or fail.
 */
setup("switch the account model to Teams", async () => {
  await setAccountModel("business");
});

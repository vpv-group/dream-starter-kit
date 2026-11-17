import { Suspense } from "react";

import { LoginForm } from "~/components/login-form";
import { getAuthSettings, getBranding } from "~/lib/payload";

export default async function SignInPage() {
  const [settings, { appName }] = await Promise.all([
    getAuthSettings(),
    getBranding(),
  ]);
  return (
    <Suspense>
      <LoginForm settings={settings} appName={appName} />
    </Suspense>
  );
}

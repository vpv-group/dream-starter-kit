import { Suspense } from "react";
import Link from "next/link";

import { SignupForm } from "~/components/signup-form";
import { getAuthSettings, getBranding } from "~/lib/payload";

export default async function SignUpPage() {
  const [settings, { appName }] = await Promise.all([
    getAuthSettings(),
    getBranding(),
  ]);

  // Invite-only: public sign-up is gated off. (For hard server enforcement also
  // set enable_signup = false in Supabase — see docs/AUTH.md.)
  if (!settings.allowSignups) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <h1 className="text-xl font-bold">Sign-up is invite only</h1>
        <p className="text-muted-foreground text-sm">
          New accounts are currently by invitation. If you have an account,{" "}
          <Link href="/sign-in" className="text-foreground underline">
            sign in
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <Suspense>
      <SignupForm settings={settings} appName={appName} />
    </Suspense>
  );
}

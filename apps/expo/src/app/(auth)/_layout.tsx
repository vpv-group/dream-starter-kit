import { Stack } from "expo-router";

import { useBrandColors } from "~/lib/brand";
import { CaptchaProvider } from "~/lib/captcha";
import { clientEnv } from "~/lib/env";

export default function AuthLayout() {
  const colors = useBrandColors();
  // Turnstile only runs on the auth screens — the CAPTCHA-gated GoTrue calls
  // (sign-in, sign-up, OTP, reset, SSO) all live here. Signed-in screens never
  // mount the WebView. Inert when EXPO_PUBLIC_TURNSTILE_SITE_KEY is unset.
  return (
    <CaptchaProvider
      siteKey={clientEnv.TURNSTILE_SITE_KEY}
      siteUrl={clientEnv.APP_URL}
    >
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </CaptchaProvider>
  );
}

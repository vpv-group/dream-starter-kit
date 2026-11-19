import type { Branding } from "~/lib/payload";
import {
  StarterKitLogo,
  usesStarterKitLogo,
} from "~/components/starter-kit-logo";

/**
 * The founder's brand at the top of auth/onboarding screens: their uploaded
 * logo, else the kit logo (while the app still carries the kit's name), else
 * the favicon mark + app name.
 */
export function OnboardingBrand({ branding }: { branding: Branding }) {
  if (branding.logoLightUrl ?? branding.logoDarkUrl) {
    return (
      <span className="inline-flex items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={branding.logoLightUrl ?? branding.logoDarkUrl ?? ""}
          alt={branding.appName}
          className="h-7 w-auto object-contain dark:hidden"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={branding.logoDarkUrl ?? branding.logoLightUrl ?? ""}
          alt={branding.appName}
          className="hidden h-7 w-auto object-contain dark:block"
        />
      </span>
    );
  }
  if (usesStarterKitLogo(branding)) {
    return (
      <span className="inline-flex items-center" aria-label={branding.appName}>
        <StarterKitLogo />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/favicon.svg" alt="" aria-hidden className="size-7" />
      <span className="text-base font-semibold">{branding.appName}</span>
    </span>
  );
}

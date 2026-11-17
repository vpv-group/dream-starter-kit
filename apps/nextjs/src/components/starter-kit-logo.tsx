import { APP_NAME } from "@acme/config/constants";
import { cn } from "@acme/ui";

/**
 * The Dream Starter Kit logo (the Dream icon and the product name), from the
 * official files in public/brand. The colour version sits on light grounds and
 * the reversed one on dark grounds; the theme class on <html> picks between
 * them. The wordmark is drawn, not typed, so always use these files rather than
 * setting the name in Geist. See docs/BRAND.md.
 *
 * `compact` shows the icon alone below the `sm` breakpoint, where the full
 * lockup would crowd a phone-width header.
 */
export function StarterKitLogo({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <>
      {compact && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/brand/dream-icon-green.svg"
          alt=""
          aria-hidden
          className={cn("size-7 sm:hidden", className)}
        />
      )}
      <span className={cn(compact ? "hidden sm:contents" : "contents")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/dream-starter-kit-logo-color.svg"
          alt=""
          aria-hidden
          className={cn("h-7 w-auto dark:hidden", className)}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/dream-starter-kit-logo-reversed.svg"
          alt=""
          aria-hidden
          className={cn("hidden h-7 w-auto dark:block", className)}
        />
      </span>
    </>
  );
}

/**
 * The kit's own logo shows only while the app still carries the kit's name and
 * no logo has been uploaded in /admin → Theme. Rename the app or upload a logo
 * and your brand takes over.
 */
export function usesStarterKitLogo(branding: {
  appName: string;
  logoLightUrl: string | null;
}): boolean {
  return !branding.logoLightUrl && branding.appName === APP_NAME;
}

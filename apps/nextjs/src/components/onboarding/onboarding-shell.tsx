import type { Branding } from "~/lib/payload";
import { OnboardingBrand } from "~/components/onboarding/onboarding-brand";

/**
 * Split layout for auth + onboarding steps (wireframe convention): logo top
 * left, the form in a 400px column, and a preview of what the step creates on
 * the right. Below 760px the preview stacks under the form.
 */
export function OnboardingShell({
  branding,
  headerRight,
  footer,
  preview,
  previewLabel,
  previewCaption,
  wide = false,
  children,
}: {
  branding: Branding;
  /** Small muted text top-right (workspace name or email). */
  headerRight?: React.ReactNode;
  /** Muted footer line under the form column. */
  footer?: React.ReactNode;
  /** The right-hand preview panel. Omit for a single centered column. */
  preview?: React.ReactNode;
  previewLabel?: string;
  previewCaption?: React.ReactNode;
  /** A wider centered column (choice-card screens without a preview). */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background flex min-h-svh flex-col min-[760px]:flex-row">
      <div
        className={
          preview
            ? "flex min-h-svh flex-col px-4 py-6 min-[760px]:w-1/2 min-[760px]:px-14 min-[760px]:py-10"
            : "flex min-h-svh w-full flex-col px-4 py-6 min-[760px]:px-14 min-[760px]:py-10"
        }
      >
        <header className="flex items-center justify-between gap-4">
          <OnboardingBrand branding={branding} />
          {headerRight ? (
            <span className="text-muted-foreground truncate text-sm">
              {headerRight}
            </span>
          ) : null}
        </header>
        <main className="flex flex-1 items-center justify-center py-10">
          <div
            className={wide ? "w-full max-w-[960px]" : "w-full max-w-[400px]"}
          >
            {children}
          </div>
        </main>
        {footer ? (
          <footer className="text-muted-foreground text-center text-sm min-[760px]:text-left">
            {footer}
          </footer>
        ) : null}
      </div>
      {preview ? (
        <aside className="bg-muted/40 flex items-center justify-center border-t px-4 py-10 min-[760px]:w-1/2 min-[760px]:border-t-0 min-[760px]:border-l min-[760px]:px-14">
          <div className="flex w-full max-w-[440px] flex-col gap-4">
            {previewLabel ? (
              <p className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
                {previewLabel}
              </p>
            ) : null}
            {preview}
            {previewCaption ? (
              <p className="text-muted-foreground text-sm">{previewCaption}</p>
            ) : null}
          </div>
        </aside>
      ) : null}
    </div>
  );
}

/** Heading + description block used at the top of every step. */
export function StepHeading({
  title,
  description,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">
        {title}
      </h1>
      {description ? (
        <p className="text-muted-foreground text-sm">{description}</p>
      ) : null}
    </div>
  );
}

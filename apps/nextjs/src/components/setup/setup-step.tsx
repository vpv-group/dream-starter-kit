import type { Branding } from "~/lib/payload";
import { OnboardingBrand } from "~/components/onboarding/onboarding-brand";
import { StepHeading } from "~/components/onboarding/onboarding-shell";
import { StepEyebrow } from "~/components/onboarding/step-progress";
import { Badge } from "~/components/ui/badge";

/**
 * The founder setup screen layout (wireframe AccountModel): brand + "Admin
 * setup" badge, the "01 / 04" eyebrow, a question-style heading, the step's
 * body, a who/how-long line beside the actions, and a muted "Next we …"
 * footer. Every /cms-setup step uses it, so they all look the same.
 */
export function SetupStep({
  branding,
  position,
  title,
  description,
  howLong,
  actions,
  next,
  children,
}: {
  branding: Branding;
  position: { index: string; total: string } | null;
  title: string;
  description: string;
  /** "under a minute" — shown as the estimate beside the actions. */
  howLong: string;
  actions: React.ReactNode;
  /** Footer: what happens after this step. */
  next: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background flex min-h-svh flex-col px-4 py-6 min-[760px]:px-14 min-[760px]:py-10">
      <header className="flex items-center justify-between gap-4">
        <OnboardingBrand branding={branding} />
        <Badge variant="secondary">Admin setup</Badge>
      </header>
      <main className="flex flex-1 items-center justify-center py-10">
        <div className="flex w-full max-w-[960px] flex-col gap-6">
          <div className="flex flex-col gap-4">
            {position ? (
              <StepEyebrow index={position.index} total={position.total} />
            ) : null}
            <StepHeading title={title} description={description} />
          </div>
          {children}
          <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground text-sm">
              Who: <span className="text-foreground">you, the admin</span>
              <span className="px-2" aria-hidden />
              How long: <span className="text-foreground">{howLong}</span>{" "}
              (estimate)
            </p>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              {actions}
            </div>
          </div>
        </div>
      </main>
      <footer className="text-muted-foreground text-sm">{next}</footer>
    </div>
  );
}

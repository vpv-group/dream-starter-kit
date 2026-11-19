/** Full-bleed layout for post-sign-up onboarding steps (no app shell). */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <main className="bg-background min-h-screen">{children}</main>;
}

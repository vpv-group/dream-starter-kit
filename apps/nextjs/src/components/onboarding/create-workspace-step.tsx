"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";

import {
  labelLower,
  normalizeSlugInput,
  slugifyWorkspaceName,
  slugProblemMessage,
  useCreateWorkspace,
  useSlugAvailability,
  workspaceErrorMessage,
  workspaceNameSchema,
} from "@acme/app";
import { cn } from "@acme/ui";

import type { Branding } from "~/lib/payload";
import {
  OnboardingShell,
  StepHeading,
} from "~/components/onboarding/onboarding-shell";
import { UseDifferentEmail } from "~/components/onboarding/use-different-email";
import { Button } from "~/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "~/components/ui/input-group";
import { Skeleton } from "~/components/ui/skeleton";
import { Spinner } from "~/components/ui/spinner";

/** Flow A step 4: Name your workspace (wireframe CreateWorkspace). */
export function CreateWorkspaceStep({
  branding,
  email,
  workspaceLabel,
  urlPrefix,
}: {
  branding: Branding;
  email: string;
  workspaceLabel: string;
  urlPrefix: string;
}) {
  const router = useRouter();
  const create = useCreateWorkspace();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  // The slug follows the name until the user edits it.
  const [slugEdited, setSlugEdited] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const status = useSlugAvailability(slug);
  const slugSubmittable =
    status.state === "available" || status.state === "error";
  const label = workspaceLabel;
  const lower = labelLower(label);

  function onNameChange(value: string) {
    setName(value);
    setNameError(null);
    if (!slugEdited) setSlug(slugifyWorkspaceName(value));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsedName = workspaceNameSchema.safeParse(name);
    if (!parsedName.success) {
      setNameError(parsedName.error.issues[0]?.message ?? "Enter a name");
      return;
    }
    if (!slugSubmittable) return;
    try {
      await create.mutateAsync({ name: parsedName.data, slug });
    } catch (error) {
      setFormError(workspaceErrorMessage(error as { message?: string }, label));
      return;
    }
    router.push("/onboarding/setting-up");
  }

  // "error" = the availability check itself failed; create_workspace still
  // validates server-side, so the user may still submit.
  const canSubmit =
    name.trim().length > 0 && slugSubmittable && !create.isPending;

  const preview = (
    <div className="bg-card overflow-hidden rounded-xl border shadow-sm">
      <div className="bg-muted/60 flex items-center gap-3 border-b px-4 py-2.5">
        <span className="bg-muted-foreground/40 size-2.5 rounded-full" />
        <span className="bg-background text-muted-foreground flex-1 truncate rounded-md border px-2 py-1 font-mono text-xs">
          {urlPrefix}
          {slug || "your-url"}
        </span>
      </div>
      <div className="grid min-h-52 grid-cols-[40%_1fr]">
        <div className="flex flex-col gap-3 border-r p-3">
          <div className="flex items-center gap-2">
            <span className="bg-foreground text-background flex size-6 items-center justify-center rounded-md text-xs font-semibold">
              {(name.trim()[0] ?? label[0] ?? "W").toUpperCase()}
            </span>
            <span className="truncate text-sm font-medium">
              {name.trim() || label}
            </span>
          </div>
          <Skeleton className="h-2 w-4/5 animate-none" />
          <Skeleton className="h-2 w-3/5 animate-none" />
          <Skeleton className="h-2 w-2/3 animate-none" />
        </div>
        <div className="flex flex-col gap-2 p-3">
          <Skeleton className="h-3 w-1/2 animate-none" />
          <Skeleton className="h-2 w-5/6 animate-none" />
          <Skeleton className="h-2 w-3/4 animate-none" />
        </div>
      </div>
    </div>
  );

  return (
    <OnboardingShell
      branding={branding}
      preview={preview}
      previewLabel="Preview"
      previewCaption="Teammates see this name and URL in their invites."
      footer={<UseDifferentEmail email={email} />}
    >
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="flex flex-1 flex-col gap-6"
      >
        <StepHeading
          title={`Name your ${lower}`}
          description={`This is where your team works together. You can rename it later.`}
        />
        <FieldGroup className="gap-5">
          <Field data-invalid={nameError ? true : undefined}>
            <FieldLabel htmlFor="workspace-name">{label} name</FieldLabel>
            <Input
              id="workspace-name"
              name="name"
              autoComplete="organization"
              autoFocus
              maxLength={64}
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              aria-invalid={nameError ? true : undefined}
            />
            {nameError ? (
              <FieldError>{nameError}</FieldError>
            ) : (
              <FieldDescription>
                Usually your company or team name.
              </FieldDescription>
            )}
          </Field>
          <Field
            data-invalid={
              status.state === "invalid" || status.state === "taken"
                ? true
                : undefined
            }
          >
            <FieldLabel htmlFor="workspace-slug">{label} URL</FieldLabel>
            <InputGroup>
              {urlPrefix ? (
                <InputGroupAddon>
                  <InputGroupText className="font-mono text-xs">
                    {urlPrefix}
                  </InputGroupText>
                </InputGroupAddon>
              ) : null}
              <InputGroupInput
                id="workspace-slug"
                name="slug"
                className="font-mono"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={slug}
                onChange={(e) => {
                  setSlugEdited(true);
                  setSlug(normalizeSlugInput(e.target.value));
                }}
                aria-describedby="workspace-slug-status"
              />
            </InputGroup>
            <SlugStatusLine status={status} />
          </Field>
        </FieldGroup>
        {formError ? <FieldError>{formError}</FieldError> : null}
        <Button
          type="submit"
          size="lg"
          className="mt-auto w-full min-[760px]:mt-0"
          disabled={!canSubmit}
        >
          {create.isPending ? <Spinner /> : null}
          Create {lower}
        </Button>
      </form>
    </OnboardingShell>
  );
}

function SlugStatusLine({
  status,
}: {
  status: ReturnType<typeof useSlugAvailability>;
}) {
  const base = "flex items-center gap-1.5 text-sm";
  switch (status.state) {
    case "idle":
      return (
        <FieldDescription id="workspace-slug-status">
          Lowercase letters, numbers and hyphens.
        </FieldDescription>
      );
    case "checking":
      return (
        <p
          id="workspace-slug-status"
          className={cn(base, "text-muted-foreground")}
        >
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Checking
        </p>
      );
    case "available":
      return (
        <p
          id="workspace-slug-status"
          role="status"
          className={cn(base, "text-primary")}
        >
          <Check className="size-4" aria-hidden />
          Available
        </p>
      );
    case "taken":
      return (
        <p
          id="workspace-slug-status"
          role="status"
          className={cn(base, "text-destructive")}
        >
          <X className="size-4" aria-hidden />
          Taken. Try another.
        </p>
      );
    case "invalid":
      return (
        <p
          id="workspace-slug-status"
          role="status"
          className={cn(base, "text-destructive")}
        >
          <X className="size-4" aria-hidden />
          {slugProblemMessage(status.problem)}
        </p>
      );
    case "error":
      return (
        <p
          id="workspace-slug-status"
          className={cn(base, "text-muted-foreground")}
        >
          Couldn't check right now. You can still try.
        </p>
      );
  }
}

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useSupabase } from "@acme/api";
import { useSaveOnboardingProgress } from "@acme/app";
import { toast } from "@acme/ui/toast";

import type { Branding } from "~/lib/payload";
import {
  OnboardingShell,
  StepHeading,
} from "~/components/onboarding/onboarding-shell";
import { StepProgress } from "~/components/onboarding/step-progress";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "Member" };

function initials(name: string, email: string): string {
  const source = name.trim() || email.split("@")[0] || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1
      ? `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`
      : source.slice(0, 2);
  return letters.toUpperCase();
}

/** Welcome step: name, photo, title (wireframe Profile). */
export function ProfileStep(props: {
  branding: Branding;
  orgId: string;
  workspaceName: string;
  role: "owner" | "admin" | "member";
  userId: string;
  email: string;
  initialName: string;
  initialTitle: string;
  initialAvatarUrl: string | null;
  stepIndex: number;
  stepTotal: number;
  nextStepKey: string | null;
  nextPath: string;
  showProgress: boolean;
}) {
  const router = useRouter();
  const supabase = useSupabase();
  const save = useSaveOnboardingProgress();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(props.initialName);
  const [title, setTitle] = useState(props.initialTitle);
  const [avatarUrl, setAvatarUrl] = useState(props.initialAvatarUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  async function advance(done: boolean) {
    await save.mutateAsync({
      orgId: props.orgId,
      step: props.nextStepKey ?? "profile",
      completed: props.nextStepKey === null && props.showProgress,
      ...(done ? { done: "profile" } : {}),
    });
    router.push(props.nextPath);
  }

  async function onUpload(file: File) {
    if (!AVATAR_TYPES.includes(file.type)) {
      toast.error("Use a PNG, JPG, WebP or GIF image.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Use an image under 2 MB.");
      return;
    }
    setUploading(true);
    const ext = file.type.split("/")[1] ?? "png";
    const path = `${props.userId}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, file, { contentType: file.type, upsert: false });
    setUploading(false);
    if (error) {
      toast.error("Couldn't upload that photo. Please try again.");
      return;
    }
    setAvatarUrl(
      supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl,
    );
  }

  async function onContinue(e: React.FormEvent) {
    e.preventDefault();
    const displayName = name.trim();
    if (!displayName) {
      setNameError("Enter your name");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName,
        title: title.trim() || null,
        avatar_url: avatarUrl,
      })
      .eq("id", props.userId);
    if (error) {
      setSaving(false);
      toast.error("Couldn't save your profile. Please try again.");
      return;
    }
    // Keep the session metadata (sidebar, menus) in step. Best-effort.
    await supabase.auth
      .updateUser({
        data: { display_name: displayName, avatar_url: avatarUrl ?? null },
      })
      .catch(() => undefined);
    try {
      await advance(true);
    } catch {
      setSaving(false);
      toast.error("Couldn't save your progress. Please try again.");
    }
  }

  async function onLater() {
    setSaving(true);
    try {
      await advance(false);
    } catch {
      setSaving(false);
    }
  }

  const preview = (
    <Card className="gap-4 py-5">
      <CardContent className="flex flex-col gap-4 px-5">
        <div className="flex items-center gap-4">
          <Avatar className="size-14">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-base">
              {initials(name, props.email)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">
              {name.trim() || props.email}
            </p>
            <p className="text-muted-foreground truncate text-sm">
              {title.trim()
                ? `${title.trim()} · ${props.workspaceName}`
                : props.workspaceName}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{ROLE_LABEL[props.role]}</Badge>
          <Badge variant="secondary">{props.email}</Badge>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <OnboardingShell
      branding={props.branding}
      headerRight={props.workspaceName}
      preview={preview}
      previewLabel="How you'll appear"
      previewCaption="Shown on the member list, comments and mentions."
    >
      <form
        onSubmit={(e) => void onContinue(e)}
        className="flex flex-col gap-6"
      >
        <StepProgress
          total={props.stepTotal}
          current={props.stepIndex}
          showBar={props.showProgress}
        />
        <StepHeading
          title="Set up your profile"
          description={`This is how your team sees you in ${props.workspaceName}.`}
        />
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-lg">
              {initials(name, props.email)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1.5">
            <Button
              type="button"
              variant="secondary"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <Spinner /> : null}
              Upload a photo
            </Button>
            <p className="text-muted-foreground text-xs">
              Square works best. PNG, JPG, WebP or GIF, up to 2 MB.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept={AVATAR_TYPES.join(",")}
              className="sr-only"
              aria-label="Upload a photo"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void onUpload(file);
              }}
            />
          </div>
        </div>
        <FieldGroup className="gap-5">
          <Field data-invalid={nameError ? true : undefined}>
            <FieldLabel htmlFor="profile-name">Full name</FieldLabel>
            <Input
              id="profile-name"
              autoComplete="name"
              maxLength={80}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
              aria-invalid={nameError ? true : undefined}
            />
            {nameError ? <FieldError>{nameError}</FieldError> : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-title">Title</FieldLabel>
            <Input
              id="profile-title"
              autoComplete="organization-title"
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <FieldDescription>
              Optional. Shown next to your name.
            </FieldDescription>
          </Field>
        </FieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            disabled={saving}
            onClick={() => void onLater()}
          >
            Do this later
          </Button>
          <Button type="submit" size="lg" disabled={saving || uploading}>
            {saving ? <Spinner /> : null}
            Continue
          </Button>
        </div>
      </form>
    </OnboardingShell>
  );
}

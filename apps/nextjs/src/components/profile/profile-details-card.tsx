"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm } from "react-hook-form";

import type { UpdateProfileInput } from "@acme/app";
import { updateProfileSchema, useProfile, useUpdateProfile } from "@acme/app";
import { toast } from "@acme/ui/toast";

import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";

/**
 * Profile metadata: display name, avatar, job title and contact phone. Saves
 * to `profiles` under RLS and syncs `user_metadata` + the CMS row (see
 * @acme/app useUpdateProfile).
 */
export function ProfileDetailsCard() {
  const profile = useProfile();
  const updateProfile = useUpdateProfile();

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<UpdateProfileInput>({
    resolver: standardSchemaResolver(updateProfileSchema),
    values: {
      displayName: profile.data?.display_name ?? "",
      avatarUrl: profile.data?.avatar_url ?? "",
      title: profile.data?.title ?? "",
      phone: profile.data?.phone ?? "",
    },
  });

  async function onSave(values: UpdateProfileInput) {
    try {
      await updateProfile.mutateAsync(values);
      toast.success("Profile saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          How you appear across the app, and how we can reach you.
        </CardDescription>
      </CardHeader>
      <form onSubmit={(e) => void handleSubmit(onSave)(e)} noValidate>
        <CardContent>
          <FieldGroup className="gap-5">
            <Field data-invalid={errors.displayName ? true : undefined}>
              <FieldLabel htmlFor="displayName">Display name</FieldLabel>
              <Input
                id="displayName"
                autoComplete="name"
                aria-invalid={!!errors.displayName}
                {...register("displayName")}
              />
              <FieldError errors={[errors.displayName]} />
            </Field>
            <Field data-invalid={errors.title ? true : undefined}>
              <FieldLabel htmlFor="title">Job title</FieldLabel>
              <Input
                id="title"
                autoComplete="organization-title"
                placeholder="e.g. Product designer"
                aria-invalid={!!errors.title}
                {...register("title")}
              />
              <FieldError errors={[errors.title]} />
            </Field>
            <Field data-invalid={errors.phone ? true : undefined}>
              <FieldLabel htmlFor="phone">Phone</FieldLabel>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+1 555 010 0199"
                aria-invalid={!!errors.phone}
                {...register("phone")}
              />
              <FieldDescription>
                Contact number only — it isn’t used to sign in.
              </FieldDescription>
              <FieldError errors={[errors.phone]} />
            </Field>
            <Field data-invalid={errors.avatarUrl ? true : undefined}>
              <FieldLabel htmlFor="avatarUrl">Avatar URL</FieldLabel>
              <Input
                id="avatarUrl"
                type="url"
                placeholder="https://…"
                aria-invalid={!!errors.avatarUrl}
                {...register("avatarUrl")}
              />
              <FieldError errors={[errors.avatarUrl]} />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="mt-6 justify-end">
          <Button
            type="submit"
            disabled={updateProfile.isPending || profile.isLoading || !isDirty}
          >
            {updateProfile.isPending ? "Saving…" : "Save profile"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

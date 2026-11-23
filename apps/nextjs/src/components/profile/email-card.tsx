"use client";

import { useState } from "react";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm } from "react-hook-form";

import type { ChangeEmailInput } from "@acme/app";
import { useSession } from "@acme/api";
import {
  accountErrorMessage,
  changeEmailSchema,
  useChangeEmail,
  useResendEmailChange,
} from "@acme/app";
import { toast } from "@acme/ui/toast";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { getSiteUrl } from "~/lib/site-url";

/** Where the email-change confirmation link returns the user (via /confirm-email). */
const returnTo = () => `${getSiteUrl()}/profile`;

/**
 * Change the sign-in email. Supabase's secure email change emails a link to
 * BOTH the current and the new address; nothing changes until both are
 * confirmed (docs/AUTH.md → Account settings). While pending, the new address
 * is `user.new_email` and can be re-sent.
 */
export function EmailCard({ onVerifyEmail }: { onVerifyEmail: () => void }) {
  const { user } = useSession();
  const [editing, setEditing] = useState(false);
  const changeEmail = useChangeEmail({ emailRedirectTo: returnTo() });
  const resend = useResendEmailChange({ emailRedirectTo: returnTo() });

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ChangeEmailInput>({
    resolver: standardSchemaResolver(changeEmailSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit({ email }: ChangeEmailInput) {
    if (email.trim().toLowerCase() === user?.email?.toLowerCase()) {
      setError("email", { message: "That’s already your email address." });
      return;
    }
    try {
      await changeEmail.mutateAsync(email);
      reset();
      setEditing(false);
      toast.success("Check your inboxes to confirm the change");
    } catch (e) {
      toast.error(accountErrorMessage(e, "Could not change your email."));
    }
  }

  async function onResend() {
    try {
      await resend.mutateAsync();
      toast.success("Confirmation sent again");
    } catch (e) {
      toast.error(accountErrorMessage(e, "Could not resend the email."));
    }
  }

  const pending = user?.new_email;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email</CardTitle>
        <CardDescription>The address you sign in with.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium" data-testid="current-email">
            {user?.email}
          </p>
          {!editing && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              Change email
            </Button>
          )}
        </div>

        {user && !user.email_confirmed_at && (
          <Alert>
            <AlertTitle>Email not verified</AlertTitle>
            <AlertDescription>
              <p>
                Your email address hasn’t been confirmed yet. We can send you a
                fresh confirmation link and code.
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-2"
                onClick={onVerifyEmail}
              >
                Verify email
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {pending && (
          <Alert data-testid="pending-email-change">
            <AlertTitle>Confirm your new email</AlertTitle>
            <AlertDescription>
              <p>
                We sent confirmation links to <strong>{user.email}</strong> and{" "}
                <strong>{pending}</strong>. Open both to finish the change —
                until then you keep signing in with your current address.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                disabled={resend.isPending}
                onClick={() => void onResend()}
              >
                {resend.isPending ? "Sending…" : "Resend confirmation"}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {editing && (
          <form
            onSubmit={(e) => void handleSubmit(onSubmit)(e)}
            noValidate
            className="flex flex-col gap-4"
          >
            <Field data-invalid={errors.email ? true : undefined}>
              <FieldLabel htmlFor="newEmail">New email</FieldLabel>
              <Input
                id="newEmail"
                type="email"
                autoComplete="email"
                autoFocus
                aria-invalid={!!errors.email}
                {...register("email")}
              />
              <FieldDescription>
                For your security we’ll email a confirmation link to both your
                current and your new address.
              </FieldDescription>
              <FieldError errors={[errors.email]} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  reset();
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={changeEmail.isPending}>
                {changeEmail.isPending ? "Sending…" : "Send confirmation"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

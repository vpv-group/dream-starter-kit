"use client";

import { useMemo, useState } from "react";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm } from "react-hook-form";

import type { ChangePasswordInput } from "@acme/app";
import {
  accountErrorMessage,
  makeChangePasswordSchema,
  useAuthConfig,
  useChangePassword,
  useSendReauthenticationCode,
} from "@acme/app";
import { toast } from "@acme/ui/toast";

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
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "~/components/ui/input-otp";

/**
 * Set or change the password. Supabase's "Secure password change" asks a
 * session older than 24h to reauthenticate: we email a 6-digit code (the
 * `nonce`) and retry with it (docs/AUTH.md → Account settings). Users who
 * signed up passwordless (magic link / OAuth) can add a password here too.
 */
export function PasswordCard() {
  const settings = useAuthConfig();
  const schema = useMemo(
    () => makeChangePasswordSchema(settings.minPasswordLength),
    [settings.minPasswordLength],
  );
  const changePassword = useChangePassword();
  const resendCode = useSendReauthenticationCode();
  // Set once Supabase asks for reauthentication; holds the pending password.
  const [pendingPassword, setPendingPassword] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordInput>({
    resolver: standardSchemaResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  function done() {
    reset();
    setPendingPassword(null);
    setCode("");
    toast.success("Password updated");
  }

  async function onSubmit({ password }: ChangePasswordInput) {
    try {
      const result = await changePassword.mutateAsync({ password });
      if (result.status === "needs_reauth") {
        setPendingPassword(password);
        toast.message("We emailed you a code to confirm it’s you");
        return;
      }
      done();
    } catch (e) {
      toast.error(accountErrorMessage(e, "Could not change your password."));
    }
  }

  async function onConfirmCode() {
    if (!pendingPassword || code.length !== 6) return;
    try {
      await changePassword.mutateAsync({
        password: pendingPassword,
        nonce: code,
      });
      done();
    } catch (e) {
      setCode("");
      toast.error(accountErrorMessage(e, "Could not change your password."));
    }
  }

  async function onResendCode() {
    try {
      await resendCode.mutateAsync();
      toast.success("New code sent");
    } catch (e) {
      toast.error(accountErrorMessage(e, "Could not send a new code."));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          Set a new password for signing in with your email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pendingPassword ? (
          <div className="flex flex-col gap-4" data-testid="reauth-step">
            <Field>
              <FieldLabel htmlFor="reauth-code">Confirmation code</FieldLabel>
              <FieldDescription>
                For your security, enter the 6-digit code we just emailed you.
              </FieldDescription>
              <InputOTP
                id="reauth-code"
                maxLength={6}
                value={code}
                onChange={setCode}
                onComplete={() => void onConfirmCode()}
                aria-label="Confirmation code"
                autoFocus
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup>
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={resendCode.isPending}
                onClick={() => void onResendCode()}
              >
                Resend code
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPendingPassword(null);
                  setCode("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={code.length !== 6 || changePassword.isPending}
                onClick={() => void onConfirmCode()}
              >
                {changePassword.isPending ? "Updating…" : "Confirm"}
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => void handleSubmit(onSubmit)(e)}
            noValidate
            className="flex flex-col gap-4"
          >
            <FieldGroup className="gap-5">
              <Field data-invalid={errors.password ? true : undefined}>
                <FieldLabel htmlFor="newPassword">New password</FieldLabel>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={!!errors.password}
                  {...register("password")}
                />
                <FieldDescription>
                  At least {settings.minPasswordLength} characters.
                </FieldDescription>
                <FieldError errors={[errors.password]} />
              </Field>
              <Field data-invalid={errors.confirmPassword ? true : undefined}>
                <FieldLabel htmlFor="confirmPassword">
                  Confirm new password
                </FieldLabel>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={!!errors.confirmPassword}
                  {...register("confirmPassword")}
                />
                <FieldError errors={[errors.confirmPassword]} />
              </Field>
            </FieldGroup>
            <div className="flex justify-end">
              <Button type="submit" disabled={changePassword.isPending}>
                {changePassword.isPending ? "Updating…" : "Update password"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm } from "react-hook-form";

import type { ChangePasswordInput } from "@acme/app";
import { useSession } from "@acme/api";
import {
  accountErrorMessage,
  isReauthenticationInvalid,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
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

type Step = "code" | "password";

/**
 * Set or change the password (docs/AUTH.md → Account settings). The card only
 * shows a "Change password" button; the dialog first calls
 * `supabase.auth.reauthenticate()` — which emails a 6-digit code — and asks for
 * it before showing the new/confirm fields. The code is sent as the `nonce` of
 * `updateUser({ password, nonce })`. Users who signed up passwordless (magic
 * link / OAuth) can add a password here too.
 */
export function PasswordCard() {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          The password you sign in with alongside your email.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          For your security we’ll email you a code first.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
        >
          Change password
        </Button>
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          {/* Mounted only while open, so every opening starts fresh and emails
              a new code. */}
          {open && <ChangePasswordFlow onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ChangePasswordFlow({ onDone }: { onDone: () => void }) {
  const { user } = useSession();
  const settings = useAuthConfig();
  const schema = useMemo(
    () => makeChangePasswordSchema(settings.minPasswordLength),
    [settings.minPasswordLength],
  );
  const changePassword = useChangePassword();
  const sendCode = useSendReauthenticationCode();
  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const requested = useRef(false);

  // reauthenticate() as the dialog opens — once per opening (the ref guards
  // React StrictMode's double effect run).
  const { mutate: requestCode } = sendCode;
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    requestCode(undefined, {
      onError: (e) =>
        setCodeError(accountErrorMessage(e, "Could not send the code.")),
    });
  }, [requestCode]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePasswordInput>({
    resolver: standardSchemaResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  function onContinue() {
    if (code.length !== 6) return;
    setCodeError(null);
    setStep("password");
  }

  async function onResend() {
    setCodeError(null);
    try {
      await sendCode.mutateAsync();
      toast.success("New code sent");
    } catch (e) {
      setCodeError(accountErrorMessage(e, "Could not send a new code."));
    }
  }

  async function onSubmit({ password }: ChangePasswordInput) {
    try {
      await changePassword.mutateAsync({ password, nonce: code });
      toast.success("Password updated");
      onDone();
    } catch (e) {
      if (isReauthenticationInvalid(e)) {
        // Wrong/expired code: back to the code step.
        setCode("");
        setCodeError(accountErrorMessage(e, "That code didn’t work."));
        setStep("code");
        return;
      }
      toast.error(accountErrorMessage(e, "Could not change your password."));
    }
  }

  if (step === "code") {
    return (
      <div className="flex flex-col gap-6" data-testid="reauth-step">
        <DialogHeader>
          <DialogTitle>Check your email</DialogTitle>
          <DialogDescription>
            {sendCode.isPending ? (
              "Sending a confirmation code…"
            ) : (
              <>
                We sent a 6-digit code to <strong>{user?.email}</strong>. Enter
                it to confirm it’s you.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <Field data-invalid={codeError ? true : undefined}>
          <FieldLabel htmlFor="reauth-code" className="sr-only">
            Confirmation code
          </FieldLabel>
          <InputOTP
            id="reauth-code"
            maxLength={6}
            value={code}
            onChange={(v) => {
              setCode(v);
              setCodeError(null);
            }}
            onComplete={onContinue}
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
          {codeError && <FieldError>{codeError}</FieldError>}
        </Field>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            disabled={sendCode.isPending}
            onClick={() => void onResend()}
          >
            {sendCode.isPending ? "Sending…" : "Resend code"}
          </Button>
          <Button
            type="button"
            disabled={code.length !== 6}
            onClick={onContinue}
          >
            Continue
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(onSubmit)(e)}
      noValidate
      className="flex flex-col gap-6"
    >
      <DialogHeader>
        <DialogTitle>Change password</DialogTitle>
        <DialogDescription>Choose a new password.</DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-5">
        <Field data-invalid={errors.password ? true : undefined}>
          <FieldLabel htmlFor="newPassword">New password</FieldLabel>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            autoFocus
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
      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={changePassword.isPending}>
          {changePassword.isPending ? "Updating…" : "Update password"}
        </Button>
      </DialogFooter>
    </form>
  );
}

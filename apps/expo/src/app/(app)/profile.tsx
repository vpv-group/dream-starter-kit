import type { ComponentProps } from "react";
import { useMemo, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { Link, Stack } from "expo-router";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Controller, useForm } from "react-hook-form";

import type {
  ChangeEmailInput,
  ChangePasswordInput,
  UpdateProfileInput,
} from "@acme/app";
import { useSession } from "@acme/api";
import {
  accountErrorMessage,
  changeEmailSchema,
  isReauthenticationInvalid,
  isWorkspaceMode,
  makeChangePasswordSchema,
  signOut,
  updateProfileSchema,
  useAuthConfig,
  useChangeEmail,
  useChangePassword,
  useDeleteAccount,
  useProfile,
  useResendEmailChange,
  useSendReauthenticationCode,
  useUpdateProfile,
  useUserTags,
} from "@acme/app";
import { Button } from "@acme/ui-native/button";
import { Input } from "@acme/ui-native/input";
import { Text } from "@acme/ui-native/text";

import { clientEnv } from "~/lib/env";
import { supabase } from "~/lib/supabase";

const msg = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong";

// Email-change links open the web app's /confirm-email (the email template
// uses the Supabase Site URL), which then returns here: /profile on the web.
const emailRedirectTo = clientEnv.CMS_URL
  ? `${clientEnv.CMS_URL.replace(/\/+$/, "")}/profile`
  : undefined;

function SectionTitle({ children }: { children: string }) {
  return <Text className="mt-4 text-base font-semibold">{children}</Text>;
}

function FieldErrorText({ message }: { message?: string }) {
  return message ? (
    <Text className="text-destructive text-sm">{message}</Text>
  ) : null;
}

/**
 * Account settings — the native twin of the web /profile page: profile
 * metadata (name, title, phone, avatar), sign-in email (secure change →
 * confirm on both addresses), password (with reauthentication code when
 * Supabase asks), tags, sign out and delete. Logic lives in @acme/app.
 */
export default function Profile() {
  const { user } = useSession();
  const deleteAccount = useDeleteAccount();
  const tags = useUserTags();
  const authConfig = useAuthConfig();
  const isAnonymous = Boolean(user?.is_anonymous);

  function onDelete() {
    Alert.alert(
      "Delete account",
      "This permanently deletes your account and all your data.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            void (async () => {
              try {
                await deleteAccount.mutateAsync();
              } catch (e) {
                Alert.alert("Delete failed", msg(e));
              }
            })(),
        },
      ],
    );
  }

  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="gap-4 p-6"
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: "Profile" }} />
      <Text className="text-muted-foreground">{user?.email}</Text>

      <ProfileSection />
      {!isAnonymous && (
        <>
          <EmailSection />
          <PasswordSection minLength={authConfig.minPasswordLength} />
        </>
      )}

      <SectionTitle>Tags</SectionTitle>
      {tags.data && tags.data.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {tags.data.map((tag) => (
            <View
              key={tag.id}
              className="bg-secondary rounded-full px-3 py-1"
              style={tag.color ? { backgroundColor: tag.color } : undefined}
            >
              <Text className="text-secondary-foreground text-xs">
                {tag.name}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text className="text-muted-foreground text-sm">
          {tags.isLoading ? "Loading…" : "No tags yet."}
        </Text>
      )}

      <View className="mt-4 gap-3">
        {isWorkspaceMode(authConfig) ? (
          <Link href="/workspaces" asChild>
            <Button title={`${authConfig.workspaceLabel}s`} variant="outline" />
          </Link>
        ) : null}
        <Button
          title="Sign out"
          variant="outline"
          onPress={() => void signOut(supabase)}
        />
        <Button
          title="Delete account"
          variant="destructive"
          loading={deleteAccount.isPending}
          onPress={onDelete}
        />
      </View>
    </ScrollView>
  );
}

/** Display name, job title, contact phone, avatar → profiles (+ CMS sync). */
function ProfileSection() {
  const profile = useProfile();
  const updateProfile = useUpdateProfile();
  const {
    control,
    handleSubmit,
    formState: { errors },
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
      Alert.alert("Saved", "Your profile was updated.");
    } catch (e) {
      Alert.alert("Save failed", msg(e));
    }
  }

  const fields: {
    name: keyof UpdateProfileInput;
    label: string;
    placeholder?: string;
    props?: Partial<ComponentProps<typeof Input>>;
  }[] = [
    { name: "displayName", label: "Display name" },
    { name: "title", label: "Job title", placeholder: "e.g. Product designer" },
    {
      name: "phone",
      label: "Phone (contact only)",
      placeholder: "+1 555 010 0199",
      props: { keyboardType: "phone-pad", autoComplete: "tel" },
    },
    {
      name: "avatarUrl",
      label: "Avatar URL",
      placeholder: "https://…",
      props: { autoCapitalize: "none", keyboardType: "url" },
    },
  ];

  return (
    <View className="gap-3">
      <SectionTitle>Profile</SectionTitle>
      {fields.map((f) => (
        <View key={f.name} className="gap-1">
          <Text className="text-sm font-medium">{f.label}</Text>
          <Controller
            control={control}
            name={f.name}
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                placeholder={f.placeholder}
                value={value ?? ""}
                onChangeText={onChange}
                onBlur={onBlur}
                {...f.props}
              />
            )}
          />
          <FieldErrorText message={errors[f.name]?.message} />
        </View>
      ))}
      <Button
        title="Save profile"
        loading={updateProfile.isPending}
        onPress={() => void handleSubmit(onSave)()}
      />
    </View>
  );
}

/** Sign-in email: request a secure change, show/resend a pending one. */
function EmailSection() {
  const { user } = useSession();
  const changeEmail = useChangeEmail({ emailRedirectTo });
  const resend = useResendEmailChange({ emailRedirectTo });
  const {
    control,
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
      Alert.alert(
        "Check your inboxes",
        "We emailed a confirmation link to your current and your new address. Open both to finish the change.",
      );
    } catch (e) {
      Alert.alert(
        "Couldn’t change email",
        accountErrorMessage(e, "Try again."),
      );
    }
  }

  return (
    <View className="gap-3">
      <SectionTitle>Email</SectionTitle>
      {user?.new_email ? (
        <View className="border-border gap-2 rounded-lg border p-3">
          <Text className="text-sm">
            Waiting for confirmation: open the links we sent to {user.email} and{" "}
            {user.new_email}.
          </Text>
          <Button
            title="Resend confirmation"
            variant="outline"
            loading={resend.isPending}
            onPress={() =>
              void resend
                .mutateAsync()
                .then(() => Alert.alert("Sent", "Confirmation sent again."))
                .catch((e: unknown) =>
                  Alert.alert(
                    "Couldn’t resend",
                    accountErrorMessage(e, "Try again."),
                  ),
                )
            }
          />
        </View>
      ) : null}
      <View className="gap-1">
        <Text className="text-sm font-medium">New email</Text>
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
            />
          )}
        />
        <FieldErrorText message={errors.email?.message} />
      </View>
      <Button
        title="Change email"
        variant="outline"
        loading={changeEmail.isPending}
        onPress={() => void handleSubmit(onSubmit)()}
      />
    </View>
  );
}

/**
 * Password: "Change password" first calls `reauthenticate()` (emails a 6-digit
 * code), asks for the code, then shows the new/confirm fields and sends
 * `updateUser({ password, nonce })` — same flow as the web dialog.
 */
function PasswordSection({ minLength }: { minLength: number }) {
  const { user } = useSession();
  const schema = useMemo(
    () => makeChangePasswordSchema(minLength),
    [minLength],
  );
  const changePassword = useChangePassword();
  const sendCode = useSendReauthenticationCode();
  const [step, setStep] = useState<"idle" | "code" | "password">("idle");
  const [code, setCode] = useState("");
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordInput>({
    resolver: standardSchemaResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  function close() {
    reset();
    setCode("");
    setStep("idle");
  }

  async function requestCode() {
    try {
      await sendCode.mutateAsync();
      setStep("code");
    } catch (e) {
      Alert.alert("Couldn’t send code", accountErrorMessage(e, "Try again."));
    }
  }

  async function onSubmit({ password }: ChangePasswordInput) {
    try {
      await changePassword.mutateAsync({ password, nonce: code });
      close();
      Alert.alert("Password updated", "Use your new password next time.");
    } catch (e) {
      if (isReauthenticationInvalid(e)) {
        setCode("");
        setStep("code");
      }
      Alert.alert(
        "Couldn’t change password",
        accountErrorMessage(e, "Try again."),
      );
    }
  }

  if (step === "idle") {
    return (
      <View className="gap-3">
        <SectionTitle>Password</SectionTitle>
        <Text className="text-muted-foreground text-sm">
          For your security we’ll email you a code first.
        </Text>
        <Button
          title="Change password"
          variant="outline"
          loading={sendCode.isPending}
          onPress={() => void requestCode()}
        />
      </View>
    );
  }

  if (step === "code") {
    return (
      <View className="gap-3">
        <SectionTitle>Check your email</SectionTitle>
        <Text className="text-muted-foreground text-sm">
          We sent a 6-digit code to {user?.email}. Enter it to confirm it’s you.
        </Text>
        <Input
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          placeholder="123456"
          autoFocus
        />
        <Button
          title="Continue"
          disabled={code.length !== 6}
          onPress={() => setStep("password")}
        />
        <Button
          title="Resend code"
          variant="outline"
          loading={sendCode.isPending}
          onPress={() => void requestCode()}
        />
        <Button title="Cancel" variant="outline" onPress={close} />
      </View>
    );
  }

  return (
    <View className="gap-3">
      <SectionTitle>Change password</SectionTitle>
      {(["password", "confirmPassword"] as const).map((name) => (
        <View key={name} className="gap-1">
          <Text className="text-sm font-medium">
            {name === "password" ? "New password" : "Confirm new password"}
          </Text>
          <Controller
            control={control}
            name={name}
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
              />
            )}
          />
          <FieldErrorText message={errors[name]?.message} />
        </View>
      ))}
      <Text className="text-muted-foreground text-xs">
        At least {minLength} characters.
      </Text>
      <Button
        title="Update password"
        loading={changePassword.isPending}
        onPress={() => void handleSubmit(onSubmit)()}
      />
      <Button title="Cancel" variant="outline" onPress={close} />
    </View>
  );
}

"use client";

import { useRouter } from "next/navigation";

import { useSession } from "@acme/api";
import {
  resendSignUpEmail,
  signOut,
  useDeleteAccount,
  useUserTags,
} from "@acme/app";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@acme/ui/alert-dialog";
import { toast } from "@acme/ui/toast";

import { EmailCard } from "~/components/profile/email-card";
import { PasswordCard } from "~/components/profile/password-card";
import { ProfileDetailsCard } from "~/components/profile/profile-details-card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { authCallbackUrl } from "~/lib/site-url";
import { createClient } from "~/lib/supabase/client";
import { authErrorMessage } from "~/lib/supabase/config";

/**
 * Account settings: profile metadata, sign-in email, password, tags, and
 * account deletion. Email/password changes go through the member's own session
 * (`supabase.auth.updateUser`) so Supabase's secure-change rules apply — see
 * docs/AUTH.md → Account settings. Anonymous sessions only see the profile.
 */
export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  const { user } = useSession();
  const deleteAccount = useDeleteAccount();
  const tags = useUserTags();

  async function onSignOut() {
    try {
      await signOut(supabase);
    } catch {
      // `signOut` guarantees a local sign-out even when the server revoke fails
      // (see @acme/app signOut), so the session is genuinely cleared here.
    }
    // Hard navigation (not router.replace + refresh): discards the client Router
    // Cache so any entitled content rendered while signed in (e.g. a gated
    // post/plan) can't linger after logout.
    window.location.assign("/sign-in");
  }

  // Recovery path for an unconfirmed email (e.g. the confirmation link
  // expired or redirected to the wrong origin before the project's auth URLs
  // were configured): re-send a fresh confirmation and finish on /check-email,
  // which offers both the link and the manual 6-digit code.
  async function onVerifyEmail() {
    if (!user?.email) return;
    try {
      await resendSignUpEmail(supabase, user.email, {
        emailRedirectTo: authCallbackUrl("/welcome"),
      });
      window.location.assign(
        `/check-email?email=${encodeURIComponent(user.email)}`,
      );
    } catch (e) {
      toast.error(authErrorMessage(e, "Could not send the email. Try again."));
    }
  }

  async function onDelete() {
    try {
      await deleteAccount.mutateAsync();
      toast.success("Account deleted");
      router.replace("/");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const isAnonymous = Boolean(user?.is_anonymous);

  return (
    <div className="@container/main mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 md:p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl">
            Account
          </h1>
          <p className="text-muted-foreground truncate text-sm">
            {user?.email ?? "Manage your profile and sign-in details."}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void onSignOut()}
        >
          Sign out
        </Button>
      </div>

      <ProfileDetailsCard />

      {!isAnonymous && (
        <>
          <EmailCard onVerifyEmail={() => void onVerifyEmail()} />
          <PasswordCard />
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tags</CardTitle>
          <CardDescription>Your plan and segments.</CardDescription>
        </CardHeader>
        <CardContent>
          {tags.data && tags.data.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {tags.data.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="secondary"
                  style={
                    tag.color
                      ? { backgroundColor: tag.color, color: "#fff" }
                      : undefined
                  }
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {tags.isLoading ? "Loading…" : "No tags yet."}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Delete your account and all associated data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="destructive"
                disabled={deleteAccount.isPending}
              >
                {deleteAccount.isPending ? "Deleting…" : "Delete account"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes your account and all associated data.
                  It cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => void onDelete()}
                >
                  Delete account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

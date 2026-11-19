"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { IconCheck } from "@tabler/icons-react";
import { useForm } from "react-hook-form";

import type { OrganizationInput } from "@acme/app";
import {
  ACTIVE_ORG_KEY,
  normalizeWebsite,
  organizationSchema,
  signOut,
} from "@acme/app";
import { Badge } from "@acme/ui/badge";
import { toast } from "@acme/ui/toast";

import { StarterKitLogo } from "~/components/starter-kit-logo";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";
import { createClient } from "~/lib/supabase/client";

interface Invitation {
  id: string;
  orgId: string;
  orgName: string;
  role: string;
  invitedBy: string | null;
  createdAt: string;
}

const setActiveOrgCookie = (id: string) => {
  document.cookie = `${ACTIVE_ORG_KEY}=${encodeURIComponent(id)}; Path=/; Max-Age=31536000; SameSite=Lax`;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

export function OrganizationOnboarding({
  email,
  invitations,
  canSkip,
}: {
  email: string;
  invitations: Invitation[];
  canSkip: boolean;
}) {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const [pending, setPending] = useState<Invitation[]>(invitations);
  const [busy, setBusy] = useState<string | null>(null);
  const form = useForm<OrganizationInput>({
    resolver: standardSchemaResolver(organizationSchema),
    defaultValues: { name: "", website: "" },
  });

  const enter = (orgId: string) => {
    setActiveOrgCookie(orgId);
    router.push("/a");
    router.refresh();
  };

  async function accept(inv: Invitation) {
    setBusy(inv.id);
    const { data, error } = await supabase.rpc("accept_invitation", {
      _invitation: inv.id,
    });
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`You joined ${inv.orgName}.`);
    enter(data);
  }

  async function decline(inv: Invitation) {
    setBusy(inv.id);
    const { error } = await supabase.rpc("decline_invitation", {
      _invitation: inv.id,
    });
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPending((list) => list.filter((i) => i.id !== inv.id));
  }

  async function create(values: OrganizationInput) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/sign-in");
      return;
    }
    const { data, error } = await supabase
      .from("organizations")
      .insert({
        name: values.name.trim(),
        website: normalizeWebsite(values.website) ?? null,
        owner_id: user.id,
      })
      .select("id")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    enter(data.id);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[520px_1fr]">
      <aside className="bg-ink text-on-ink hidden flex-col justify-between p-10 lg:flex">
        <StarterKitLogo />
        <div className="space-y-6">
          <h2 className="text-3xl font-semibold tracking-tight">
            Your team works in one organization.
          </h2>
          <p className="text-on-ink-muted">
            An organization holds your members, billing and data. You can belong
            to more than one and switch between them from the header.
          </p>
          <ul className="space-y-3 text-sm">
            {[
              "Invite people by email",
              "Give each person a role",
              "Change the name and website later",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <IconCheck className="text-primary-on-ink size-4" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <span />
      </aside>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-[440px] space-y-8">
          <header className="space-y-2">
            <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
              Organization
            </p>
            <h1 className="text-2xl font-bold tracking-tight">
              Set up your organization
            </h1>
            <p className="text-muted-foreground text-sm">
              {pending.length > 0
                ? "Join the one you were invited to, or create a new one."
                : "Create one for your team. You can invite people next."}
            </p>
          </header>

          {pending.map((inv) => (
            <div
              key={inv.id}
              className="bg-muted/40 ring-foreground/10 space-y-4 rounded-xl p-4 ring-1"
            >
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Invitation for {email}
                </span>
                <Badge variant="warning">Pending</Badge>
              </div>
              <div className="flex items-center gap-3">
                <span className="bg-primary text-primary-foreground grid size-10 place-items-center rounded-lg text-sm font-semibold">
                  {initials(inv.orgName)}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{inv.orgName}</p>
                  <p className="text-muted-foreground text-xs">
                    {inv.invitedBy
                      ? `${inv.invitedBy} invited you`
                      : "You're invited"}{" "}
                    as {inv.role === "admin" ? "Admin" : "Member"} ·{" "}
                    {new Date(inv.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  disabled={busy !== null}
                  onClick={() => void accept(inv)}
                >
                  Accept and join
                </Button>
                <Button
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void decline(inv)}
                >
                  Decline
                </Button>
              </div>
            </div>
          ))}

          {pending.length > 0 && (
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-muted-foreground text-xs">
                or create a new organization
              </span>
              <Separator className="flex-1" />
            </div>
          )}

          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((v) => create(v))}
            noValidate
          >
            <div className="space-y-2">
              <Label htmlFor="org-name">
                <span className="text-destructive">*</span> Organization name
              </Label>
              <Input
                id="org-name"
                placeholder="Northwind Traders"
                aria-invalid={!!form.formState.errors.name}
                {...form.register("name")}
              />
              {form.formState.errors.name && (
                <p className="text-destructive text-xs">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-website">Website</Label>
              <div className="flex">
                <span className="bg-muted text-muted-foreground inline-flex items-center rounded-l-md border border-r-0 px-3 text-sm">
                  https://
                </span>
                <Input
                  id="org-website"
                  className="rounded-l-none"
                  placeholder="northwind.example.com"
                  aria-invalid={!!form.formState.errors.website}
                  {...form.register("website")}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                {form.formState.errors.website?.message ??
                  "Optional. We use it to match your organization to an existing account."}
              </p>
            </div>
            <Button
              type="submit"
              variant={pending.length > 0 ? "outline" : "default"}
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              Create organization
            </Button>
          </form>

          <footer className="text-muted-foreground flex items-center justify-between text-xs">
            <span>Signed in as {email}</span>
            {canSkip ? (
              <button
                type="button"
                className="underline-offset-4 hover:underline"
                onClick={() => router.push("/a")}
              >
                Skip for now
              </button>
            ) : (
              <button
                type="button"
                className="underline-offset-4 hover:underline"
                onClick={() =>
                  void signOut(supabase).then(() => router.push("/sign-in"))
                }
              >
                Sign out
              </button>
            )}
          </footer>
        </div>
      </section>
    </div>
  );
}

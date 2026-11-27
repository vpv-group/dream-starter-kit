"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@acme/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@acme/ui/dialog";

/**
 * Canny's "Sign up for {Company}" prompt, opened when a visitor votes,
 * posts or comments where the board needs an account. It sends them to the
 * kit's own sign-up / sign-in (whose methods come from /admin → System →
 * Authentication) and brings them back to this page afterwards.
 */
export const AuthPromptContext = createContext<{
  open: (reason?: string) => void;
}>({
  open: () => undefined,
});

export const useAuthPrompt = () => useContext(AuthPromptContext);

export function AuthPromptProvider({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const pathname = usePathname();
  const open = useCallback((r?: string) => setReason(r ?? "vote"), []);
  const value = useMemo(() => ({ open }), [open]);
  const back = encodeURIComponent(pathname);

  return (
    <AuthPromptContext.Provider value={value}>
      {children}
      <Dialog
        open={reason !== null}
        onOpenChange={(o) => !o && setReason(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Sign up for {title}</DialogTitle>
            <DialogDescription>
              We use this board to collect feedback from people like you. Sign
              up to{" "}
              {reason === "post"
                ? "post"
                : reason === "comment"
                  ? "comment"
                  : "vote"}{" "}
              and get updates when things change.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button asChild>
              <Link href={`/sign-up?redirectTo=${back}`}>Sign up</Link>
            </Button>
            <p className="text-muted-foreground text-center text-sm">
              Already have an account?{" "}
              <Link
                href={`/sign-in?redirectTo=${back}`}
                className="text-foreground font-medium underline-offset-4 hover:underline"
              >
                Log in
              </Link>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </AuthPromptContext.Provider>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { CodeIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@acme/ui/alert";
import { Button } from "@acme/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@acme/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@acme/ui/tabs";

import { useWidgetStatus } from "../hooks/use-feedback";

function snippets(origin: string) {
  const script = `<script src="${origin}/api/mod/feedback/embed.js" async></script>`;
  return {
    inline: `<div data-dream-feedback data-tab="feedback"></div>\n${script}`,
    panel: `<button type="button" onclick="DreamFeedback.open({ tab: 'feedback' })">Feedback</button>\n${script}`,
    changelog: `<button type="button" data-dream-changelog-badge>What's new</button>\n${script}`,
  };
}

/** Staff: the copy-paste snippet for the embeddable widget. */
export function EmbedDialog() {
  const [open, setOpen] = useState(false);
  const status = useWidgetStatus();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const code = snippets(origin);
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success("Copied");
  };
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <CodeIcon />
        Embed
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Put feedback on your website</DialogTitle>
            <DialogDescription>
              Paste one of these into your site or docs. People can vote, post
              and comment without leaving the page.
            </DialogDescription>
          </DialogHeader>
          {status.data &&
          (!status.data.enabled || !status.data.origins.length) ? (
            <Alert>
              <AlertTitle>
                {status.data.enabled
                  ? "No sites allowed yet"
                  : "The widget is off"}
              </AlertTitle>
              <AlertDescription>
                Turn it on and list the sites that may show it in{" "}
                <Link
                  href="/admin/module-settings/feedback"
                  className="underline"
                >
                  Settings → Widget
                </Link>
                . Until then, browsers refuse to show it anywhere else.
              </AlertDescription>
            </Alert>
          ) : status.data ? (
            <p className="text-muted-foreground text-sm">
              Allowed on: {status.data.origins.join(", ")}
            </p>
          ) : null}
          <Tabs defaultValue="inline">
            <TabsList variant="line">
              <TabsTrigger value="inline">In the page</TabsTrigger>
              <TabsTrigger value="panel">Side panel</TabsTrigger>
              <TabsTrigger value="changelog">What&apos;s new badge</TabsTrigger>
            </TabsList>
            {(["inline", "panel", "changelog"] as const).map((k) => (
              <TabsContent
                key={k}
                value={k}
                className="flex flex-col gap-2 pt-3"
              >
                <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
                  <code>{code[k]}</code>
                </pre>
                <Button
                  size="sm"
                  className="self-end"
                  onClick={() => copy(code[k])}
                >
                  <CopyIcon />
                  Copy
                </Button>
              </TabsContent>
            ))}
          </Tabs>
          <p className="text-muted-foreground text-xs">
            Options: <code>data-tab</code> (feedback, roadmap, changelog),{" "}
            <code>data-board</code> (a board slug), <code>data-theme</code>{" "}
            (light, dark). People log in inside the widget with an email code.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

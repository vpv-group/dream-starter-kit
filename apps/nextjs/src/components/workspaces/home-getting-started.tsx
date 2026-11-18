"use client";

import { usePathname } from "next/navigation";
import { Users } from "lucide-react";

import type { ChecklistItem } from "~/components/onboarding/setup-checklist";
import { SetupChecklistItems } from "~/components/onboarding/setup-checklist";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Progress } from "~/components/ui/progress";

export interface GettingStarted {
  workspaceName: string;
  items: ChecklistItem[];
}

/**
 * Getting-started checklist on /a (wireframe Home), Teams/Both only. The app
 * home page is generated from the dashboard module, so the (app) shell renders
 * this above it on /a only. Hidden once every item is done.
 */
export function HomeGettingStarted({ data }: { data: GettingStarted }) {
  const pathname = usePathname();
  if (pathname !== "/a") return null;

  const done = data.items.filter((i) => i.status === "done").length;
  const total = data.items.length;
  if (total === 0 || done === total) return null;
  const next = data.items.find((i) => i.status !== "done");

  return (
    <section className="flex flex-col gap-6 px-4 pt-4 lg:px-6 lg:pt-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to {data.workspaceName}
        </h1>
        <p className="text-muted-foreground text-sm">
          A few things to finish when you have a moment.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="gap-3">
            <CardTitle className="text-2xl">
              {done} of {total} done
            </CardTitle>
            <Progress
              value={(done / total) * 100}
              aria-label={`${done} of ${total} done`}
            />
            {next ? (
              <p className="text-muted-foreground text-sm">
                Next: {next.title.charAt(0).toLowerCase() + next.title.slice(1)}
                .
              </p>
            ) : null}
          </CardHeader>
          <CardContent>
            <SetupChecklistItems items={data.items} />
          </CardContent>
        </Card>
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>Your team&apos;s activity shows here</EmptyTitle>
            <EmptyDescription>
              Once people join {data.workspaceName}, you&apos;ll see what
              they&apos;re working on.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </section>
  );
}

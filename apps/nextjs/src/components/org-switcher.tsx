"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconCheck, IconPlus, IconSelector } from "@tabler/icons-react";

import { useActiveOrg } from "@acme/app";
import { cn } from "@acme/ui";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@acme/ui/command";

import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

function OrgMark({ name }: { name: string }) {
  return (
    <span className="bg-primary text-primary-foreground grid size-6 shrink-0 place-items-center rounded-md text-[10px] font-semibold">
      {initials(name)}
    </span>
  );
}

const ROLE_LABEL = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
} as const;

/** Header organization switcher (docs/DESIGN-SYSTEM.md, wireframe 14). */
export function OrgSwitcher({ canCreate }: { canCreate: boolean }) {
  const { orgs, activeOrg, setActiveOrg } = useActiveOrg();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  if (!activeOrg) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-2 px-2"
          aria-label={`Organization: ${activeOrg.name}. Switch organization`}
        >
          <OrgMark name={activeOrg.name} />
          <span className="max-w-40 truncate text-sm font-medium">
            {activeOrg.name}
          </span>
          <IconSelector className="text-muted-foreground size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          {orgs.length > 5 && (
            <CommandInput placeholder="Find an organization…" />
          )}
          <CommandList>
            <CommandEmpty>No organizations found.</CommandEmpty>
            <CommandGroup heading="Organizations">
              {orgs.map((o) => (
                <CommandItem
                  key={o.id}
                  value={`${o.name} ${o.id}`}
                  onSelect={() => {
                    setOpen(false);
                    if (o.id !== activeOrg.id) setActiveOrg(o.id);
                  }}
                  className="gap-2"
                >
                  <OrgMark name={o.name} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{o.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {o.isPersonal ? "Personal" : ROLE_LABEL[o.role]}
                    </span>
                  </span>
                  <IconCheck
                    className={cn(
                      "size-4",
                      o.id === activeOrg.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
            {canCreate && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    className="gap-2"
                    onSelect={() => {
                      setOpen(false);
                      router.push("/onboarding/organization?new=1");
                    }}
                  >
                    <IconPlus className="size-4" />
                    Create organization
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

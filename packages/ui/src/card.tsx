import type * as React from "react";

import { cn } from "./index";

/**
 * Card. `variant="framed"` is the design-system framed card
 * (docs/DESIGN-SYSTEM.md §4.1): a tinted frame with a header strip and an
 * inset white content panel. It is opt-in, so existing cards don't change.
 * `size="sm"` tightens the frame's spacing (side rails, widgets).
 */
function Card({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<"div"> & {
  variant?: "default" | "framed";
  size?: "default" | "sm";
}) {
  return (
    <div
      data-slot="card"
      data-variant={variant}
      data-size={size}
      className={cn(
        "group/card text-card-foreground flex flex-col",
        variant === "default" &&
          "bg-card gap-6 rounded-xl border py-6 shadow-sm",
        variant === "framed" &&
          "bg-muted/40 ring-foreground/10 @container/card gap-0 overflow-hidden rounded-xl text-sm ring-1 [--card-spacing:--spacing(4)] data-[size=sm]:[--card-spacing:--spacing(3)]",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        "group-data-[variant=framed]/card:min-h-13 group-data-[variant=framed]/card:grid-rows-[auto] group-data-[variant=framed]/card:content-center group-data-[variant=framed]/card:items-center group-data-[variant=framed]/card:gap-1 group-data-[variant=framed]/card:px-(--card-spacing) group-data-[variant=framed]/card:py-2.5",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "leading-none font-semibold",
        "group-data-[variant=framed]/card:text-sm group-data-[variant=framed]/card:leading-snug",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        "group-data-[variant=framed]/card:row-span-1 group-data-[variant=framed]/card:self-center",
        className,
      )}
      {...props}
    />
  );
}

/**
 * In a framed card this is the inset panel. Pass `className="p-0"` for a
 * flush panel that holds a table, toolbar or list.
 */
function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn(
        "px-6",
        "group-data-[variant=framed]/card:bg-card group-data-[variant=framed]/card:ring-foreground/5 group-data-[variant=framed]/card:mx-0 group-data-[variant=framed]/card:flex-1 group-data-[variant=framed]/card:rounded-lg group-data-[variant=framed]/card:p-(--card-spacing) group-data-[variant=framed]/card:shadow-2xs group-data-[variant=framed]/card:ring-1",
        className,
      )}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center px-6 [.border-t]:pt-6",
        "group-data-[variant=framed]/card:px-(--card-spacing) group-data-[variant=framed]/card:py-2.5",
        className,
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};

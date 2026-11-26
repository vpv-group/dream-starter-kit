"use client";

import * as React from "react";
import { format, isValid, parseISO } from "date-fns";
import { CalendarIcon, XIcon } from "lucide-react";

import { Button } from "./button";
import { Calendar } from "./calendar";
import { cn } from "./index";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/** `yyyy-MM-dd` → local Date (no time-zone shift), or undefined. */
export function parseDateOnly(value: string | null | undefined) {
  if (!value) return undefined;
  const date = parseISO(value.slice(0, 10));
  return isValid(date) ? date : undefined;
}

/** Local Date → `yyyy-MM-dd`. */
export function toDateOnly(date: Date) {
  return format(date, "yyyy-MM-dd");
}

const DISPLAY = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/**
 * A date field: a button showing the date, opening a calendar in a popover.
 * Values are date-only strings (`yyyy-MM-dd`), the shape Postgres `date`
 * columns round-trip, so there is no time-zone drift.
 */
function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  clearable = true,
  disabled,
  className,
  id,
  "aria-label": ariaLabel,
  size = "sm",
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
  size?: "sm" | "default";
}) {
  const [open, setOpen] = React.useState(false);
  const selected = parseDateOnly(value);

  return (
    <div className={cn("relative inline-flex", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            size={size}
            disabled={disabled}
            aria-label={ariaLabel}
            data-empty={!selected}
            className={cn(
              "data-[empty=true]:text-muted-foreground w-full justify-start font-normal tabular-nums",
              clearable && selected && "pr-8 has-[>svg]:pr-8",
            )}
          >
            <CalendarIcon />
            {selected ? DISPLAY.format(selected) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={(date) => {
              onChange(date ? toDateOnly(date) : null);
              setOpen(false);
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>
      {clearable && selected && !disabled ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="absolute top-1/2 right-1 -translate-y-1/2"
          aria-label="Clear date"
          onClick={() => onChange(null)}
        >
          <XIcon />
        </Button>
      ) : null}
    </div>
  );
}

export { DatePicker };

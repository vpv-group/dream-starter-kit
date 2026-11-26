"use client";

import * as React from "react";
import { CheckIcon, ListFilterIcon, XIcon } from "lucide-react";

import type {
  FilterCondition,
  FilterFieldType,
  FilterOperator,
  FilterQuery,
} from "./filters-query";
import type { Tone } from "./status-dot";
import { Button } from "./button";
import { Calendar } from "./calendar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { parseDateOnly, toDateOnly } from "./date-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import {
  createCondition,
  isConditionActive,
  OPERATOR_LABELS,
  operatorArity,
  OPERATORS_BY_TYPE,
  operatorTakesValues,
} from "./filters-query";
import { cn } from "./index";
import { Input } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { StatusDot } from "./status-dot";

export type {
  FilterCondition,
  FilterFieldType,
  FilterOperator,
  FilterQuery,
} from "./filters-query";

/** One choice of a select/multiselect field. */
export interface FilterOption {
  value: string;
  label: string;
  /** Status tone (§5) — renders a dot. */
  tone?: Tone;
  /** Data-driven colour (e.g. a label's hex) — renders a dot. */
  color?: string;
  /** Any leading visual (avatar, icon); wins over tone/color. */
  icon?: React.ReactNode;
}

/** A filterable field, described once per screen. */
export interface FilterField {
  id: string;
  label: string;
  type: FilterFieldType;
  icon?: React.ReactNode;
  options?: FilterOption[];
  /** Restrict/reorder operators; defaults to the type's list. */
  operators?: FilterOperator[];
  /** Show a search box in the option list (default: more than 7 options). */
  searchable?: boolean;
  placeholder?: string;
}

const DATE_FMT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function OptionVisual({ option }: { option: FilterOption }) {
  if (option.icon) return <>{option.icon}</>;
  if (option.color)
    return (
      <span
        aria-hidden
        className="inline-block size-2 shrink-0 rounded-full border border-black/10 dark:border-white/15"
        style={{ backgroundColor: option.color }}
      />
    );
  if (option.tone) return <StatusDot tone={option.tone} />;
  return null;
}

/** Up to four overlapping dots for a multi-value chip (§5). */
function StackedVisuals({ options }: { options: FilterOption[] }) {
  const shown = options
    .filter((o) => o.icon != null || !!o.color || !!o.tone)
    .slice(0, 4);
  if (shown.length === 0) return null;
  return (
    <span className="flex items-center">
      {shown.map((option, i) => (
        <span
          key={option.value}
          className={cn(
            "ring-background inline-flex rounded-full ring-2",
            i > 0 && "-ml-0.5",
          )}
        >
          <OptionVisual option={option} />
        </span>
      ))}
    </span>
  );
}

function valueSummary(field: FilterField, condition: FilterCondition) {
  const values = condition.values.filter((v) => v !== "");
  if (values.length === 0)
    return (
      <span className="text-muted-foreground">
        {field.placeholder ?? "Select…"}
      </span>
    );

  switch (field.type) {
    case "select":
    case "multiselect":
    case "boolean": {
      const options = values.map(
        (v) =>
          field.options?.find((o) => o.value === v) ?? { value: v, label: v },
      );
      if (options.length === 1 && options[0]) {
        return (
          <>
            <OptionVisual option={options[0]} />
            <span className="truncate">{options[0].label}</span>
          </>
        );
      }
      return (
        <>
          <StackedVisuals options={options} />
          <span className="tabular-nums">
            {options.length} {field.label.toLowerCase()}
          </span>
        </>
      );
    }
    case "date": {
      const dates = values.map((v) => {
        const d = parseDateOnly(v);
        return d ? DATE_FMT.format(d) : v;
      });
      return <span className="tabular-nums">{dates.join(" – ")}</span>;
    }
    case "number":
      return <span className="tabular-nums">{values.join(" – ")}</span>;
    default:
      return <span className="max-w-40 truncate">“{values[0]}”</span>;
  }
}

function OptionsEditor({
  field,
  condition,
  onChange,
  onDone,
}: {
  field: FilterField;
  condition: FilterCondition;
  onChange: (values: string[]) => void;
  onDone: () => void;
}) {
  const options =
    field.type === "boolean" && !field.options
      ? [
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ]
      : (field.options ?? []);
  const single = operatorArity(condition.operator) === 1;
  const searchable = field.searchable ?? options.length > 7;

  return (
    <Command>
      {searchable ? (
        <CommandInput placeholder={`Search ${field.label.toLowerCase()}…`} />
      ) : null}
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup>
          {options.map((option) => {
            const checked = condition.values.includes(option.value);
            return (
              <CommandItem
                key={option.value}
                value={`${option.label} ${option.value}`}
                onSelect={() => {
                  if (single) {
                    onChange([option.value]);
                    onDone();
                    return;
                  }
                  onChange(
                    checked
                      ? condition.values.filter((v) => v !== option.value)
                      : [...condition.values, option.value],
                  );
                }}
              >
                <span
                  aria-hidden
                  className={cn(
                    "border-input flex size-4 items-center justify-center rounded-[4px] border",
                    single && "rounded-full",
                    checked &&
                      "bg-primary border-primary text-primary-foreground",
                  )}
                >
                  {checked ? <CheckIcon className="size-3" /> : null}
                </span>
                <OptionVisual option={option} />
                <span className="truncate">{option.label}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

function DateEditor({
  condition,
  onChange,
  onDone,
}: {
  condition: FilterCondition;
  onChange: (values: string[]) => void;
  onDone: () => void;
}) {
  if (condition.operator === "between") {
    const from = parseDateOnly(condition.values[0]);
    const to = parseDateOnly(condition.values[1]);
    return (
      <Calendar
        mode="range"
        selected={{ from, to }}
        defaultMonth={from}
        onSelect={(range) => {
          const next = [
            range?.from ? toDateOnly(range.from) : "",
            range?.to ? toDateOnly(range.to) : "",
          ];
          onChange(next);
          if (range?.from && range.to) onDone();
        }}
        autoFocus
      />
    );
  }
  const selected = parseDateOnly(condition.values[0]);
  return (
    <Calendar
      mode="single"
      selected={selected}
      defaultMonth={selected}
      onSelect={(date) => {
        onChange(date ? [toDateOnly(date)] : []);
        onDone();
      }}
      autoFocus
    />
  );
}

function InputEditor({
  field,
  condition,
  onChange,
  onDone,
}: {
  field: FilterField;
  condition: FilterCondition;
  onChange: (values: string[]) => void;
  onDone: () => void;
}) {
  const two = operatorArity(condition.operator) === 2;
  const [draft, setDraft] = React.useState<string[]>(
    two
      ? [condition.values[0] ?? "", condition.values[1] ?? ""]
      : [condition.values[0] ?? ""],
  );
  const commit = () => {
    onChange(draft.map((v) => v.trim()));
    onDone();
  };
  const type = field.type === "number" ? "number" : "text";
  return (
    <form
      className="flex items-center gap-2 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      {draft.map((value, i) => (
        <Input
          key={i}
          type={type}
          inputMode={type === "number" ? "decimal" : undefined}
          autoFocus={i === 0}
          aria-label={two ? (i === 0 ? "From" : "To") : field.label}
          className="h-8"
          value={value}
          placeholder={two ? (i === 0 ? "From" : "To") : field.placeholder}
          onChange={(e) =>
            setDraft((prev) =>
              prev.map((v, j) => (j === i ? e.target.value : v)),
            )
          }
        />
      ))}
      <Button type="submit" size="sm">
        Apply
      </Button>
    </form>
  );
}

function FilterChip({
  field,
  condition,
  defaultOpen,
  onChange,
  onRemove,
}: {
  field: FilterField;
  condition: FilterCondition;
  defaultOpen: boolean;
  onChange: (condition: FilterCondition) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const operators = field.operators ?? OPERATORS_BY_TYPE[field.type];
  const takesValues = operatorTakesValues(condition.operator);
  const setValues = (values: string[]) => onChange({ ...condition, values });
  const done = () => setOpen(false);

  return (
    <div
      data-slot="filter-chip"
      data-active={isConditionActive(condition)}
      className="bg-background inline-flex h-7 max-w-full items-center overflow-hidden rounded-md border text-xs shadow-xs data-[active=false]:border-dashed"
    >
      <span className="text-muted-foreground flex items-center gap-1.5 px-2 [&_svg]:size-3.5">
        {field.icon}
        {field.label}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="hover:bg-accent h-full border-l px-2 whitespace-nowrap"
            aria-label={`${field.label} operator`}
          >
            {OPERATOR_LABELS[condition.operator]}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup
            value={condition.operator}
            onValueChange={(op) => {
              const operator = op as FilterOperator;
              const arity = operatorArity(operator);
              const values =
                arity === 0
                  ? []
                  : arity === 1
                    ? condition.values.slice(0, 1)
                    : arity === 2
                      ? condition.values.slice(0, 2)
                      : condition.values;
              onChange({ ...condition, operator, values });
              if (arity !== 0 && values.length === 0) setOpen(true);
            }}
          >
            {operators.map((op) => (
              <DropdownMenuRadioItem key={op} value={op}>
                {OPERATOR_LABELS[op]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {takesValues ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="hover:bg-accent flex h-full min-w-0 items-center gap-1.5 border-l px-2 font-medium whitespace-nowrap"
              aria-label={`${field.label} value`}
            >
              {valueSummary(field, condition)}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className={cn("p-0", field.type === "date" ? "w-auto" : "w-64")}
          >
            {field.type === "date" ? (
              <DateEditor
                condition={condition}
                onChange={setValues}
                onDone={done}
              />
            ) : field.type === "text" || field.type === "number" ? (
              <InputEditor
                key={condition.operator}
                field={field}
                condition={condition}
                onChange={setValues}
                onDone={done}
              />
            ) : (
              <OptionsEditor
                field={field}
                condition={condition}
                onChange={setValues}
                onDone={done}
              />
            )}
          </PopoverContent>
        </Popover>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        className="hover:bg-accent text-muted-foreground hover:text-foreground flex h-full items-center border-l px-1.5"
        aria-label={`Remove ${field.label} filter`}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * The Filters builder (docs/DESIGN-SYSTEM.md §4.3): active conditions as
 * removable chips (field · operator · values), then a **Filters** button that
 * adds one. Controlled: pass the query and write it back on change. Evaluate
 * it with `matchesFilters` (`@acme/ui/filters-query`) or compile it to a
 * server query.
 */
function Filters({
  fields,
  value,
  onChange,
  className,
  label = "Filters",
}: {
  fields: FilterField[];
  value: FilterQuery;
  onChange: (query: FilterQuery) => void;
  className?: string;
  label?: string;
}) {
  const [adding, setAdding] = React.useState(false);
  const [justAdded, setJustAdded] = React.useState<string | null>(null);
  const byId = React.useMemo(
    () => new Map(fields.map((f) => [f.id, f])),
    [fields],
  );
  const activeCount = value.filter(isConditionActive).length;

  return (
    <div
      data-slot="filters"
      className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}
    >
      {value.map((condition) => {
        const field = byId.get(condition.field);
        if (!field) return null;
        return (
          <FilterChip
            key={condition.id}
            field={field}
            condition={condition}
            defaultOpen={justAdded === condition.id}
            onChange={(next) =>
              onChange(value.map((c) => (c.id === next.id ? next : c)))
            }
            onRemove={() =>
              onChange(value.filter((c) => c.id !== condition.id))
            }
          />
        );
      })}
      <Popover open={adding} onOpenChange={setAdding}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs">
            <ListFilterIcon className="size-3.5" />
            <span className="sr-only @lg/toolbar:not-sr-only">{label}</span>
            {activeCount > 0 ? (
              <span className="bg-muted rounded-sm px-1 tabular-nums">
                {activeCount}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-0">
          <Command>
            <CommandInput placeholder="Filter by…" />
            <CommandList>
              <CommandEmpty>No fields.</CommandEmpty>
              <CommandGroup>
                {fields.map((field) => (
                  <CommandItem
                    key={field.id}
                    value={field.label}
                    onSelect={() => {
                      const condition = createCondition(field.id, field.type);
                      if (field.operators?.[0])
                        condition.operator = field.operators[0];
                      setJustAdded(condition.id);
                      setAdding(false);
                      onChange([...value, condition]);
                    }}
                    className="[&_svg]:text-muted-foreground"
                  >
                    {field.icon}
                    {field.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.length > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-7 px-2 text-xs"
          onClick={() => onChange([])}
        >
          Clear
        </Button>
      ) : null}
    </div>
  );
}

export { Filters, FilterChip, OptionVisual };

"use client";

import type { LucideIcon } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "~/components/ui/field";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { Separator } from "~/components/ui/separator";

export interface ChoiceOption<V extends string> {
  value: V;
  title: string;
  description: string;
  /** Muted footnote under a divider ("Sign-up stays as it is today."). */
  note?: string;
  icon: LucideIcon;
}

/**
 * shadcn "choice card" pattern: RadioGroup items inside FieldLabel/Field.
 * The kit's FieldLabel already styles the checked card with `primary`.
 */
export function ChoiceCards<V extends string>({
  name,
  options,
  value,
  onValueChange,
  columns,
}: {
  name: string;
  options: readonly ChoiceOption<V>[];
  value: V | null;
  onValueChange: (value: V) => void;
  columns: 2 | 3;
}) {
  return (
    <RadioGroup
      name={name}
      value={value ?? ""}
      onValueChange={(v) => onValueChange(v as V)}
      className={
        columns === 3
          ? "grid gap-4 md:grid-cols-3"
          : "grid gap-4 sm:grid-cols-2"
      }
    >
      {options.map((option) => {
        const id = `${name}-${option.value}`;
        const Icon = option.icon;
        return (
          <FieldLabel key={option.value} htmlFor={id} className="h-full">
            <Field className="h-full items-start">
              <div className="flex w-full items-start justify-between gap-4">
                <Icon
                  aria-hidden
                  className="text-muted-foreground size-6"
                  strokeWidth={1.5}
                />
                <RadioGroupItem value={option.value} id={id} />
              </div>
              <FieldContent className="gap-2">
                <FieldTitle className="text-base">{option.title}</FieldTitle>
                <FieldDescription>{option.description}</FieldDescription>
                {option.note ? (
                  <>
                    <Separator className="my-2" />
                    <FieldDescription>{option.note}</FieldDescription>
                  </>
                ) : null}
              </FieldContent>
            </Field>
          </FieldLabel>
        );
      })}
    </RadioGroup>
  );
}

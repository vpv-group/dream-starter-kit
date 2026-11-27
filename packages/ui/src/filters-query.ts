/**
 * Filter queries — the pure half of the Filters builder
 * (docs/DESIGN-SYSTEM.md §4.3). No React here, so modules can run the same
 * matcher on the server, in tests and on native.
 *
 * A query is a list of conditions joined with AND. Each condition names a
 * field, an operator and string values (dates are `yyyy-MM-dd`, numbers and
 * booleans are stringified) so a query serializes into a URL or a saved
 * view without loss.
 */

export type FilterFieldType =
  | "select" // one value per record (status, priority)
  | "multiselect" // many values per record (labels, tags, assignees)
  | "date"
  | "text"
  | "number"
  | "boolean";

export type FilterOperator =
  | "is"
  | "is_not"
  | "any_of"
  | "none_of"
  | "all_of"
  | "contains"
  | "not_contains"
  | "before"
  | "after"
  | "between"
  | "gt"
  | "lt"
  | "empty"
  | "not_empty";

export interface FilterCondition {
  id: string;
  field: string;
  operator: FilterOperator;
  values: string[];
}

export type FilterQuery = FilterCondition[];

export const OPERATORS_BY_TYPE: Record<FilterFieldType, FilterOperator[]> = {
  select: ["any_of", "none_of", "empty", "not_empty"],
  multiselect: ["any_of", "all_of", "none_of", "empty", "not_empty"],
  date: ["is", "before", "after", "between", "empty", "not_empty"],
  text: ["contains", "not_contains", "is", "is_not", "empty", "not_empty"],
  number: ["is", "is_not", "gt", "lt", "between", "empty", "not_empty"],
  boolean: ["is"],
};

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  is: "is",
  is_not: "is not",
  any_of: "is any of",
  none_of: "is none of",
  all_of: "has all of",
  contains: "contains",
  not_contains: "does not contain",
  before: "is before",
  after: "is after",
  between: "is between",
  gt: "is greater than",
  lt: "is less than",
  empty: "is empty",
  not_empty: "is not empty",
};

export function defaultOperator(type: FilterFieldType): FilterOperator {
  return OPERATORS_BY_TYPE[type][0] ?? "is";
}

/** Operators that take no values (the chip shows no value editor). */
export function operatorTakesValues(operator: FilterOperator) {
  return operator !== "empty" && operator !== "not_empty";
}

/** How many values an operator reads: 1, 2 (between) or many. */
export function operatorArity(operator: FilterOperator): 0 | 1 | 2 | "many" {
  switch (operator) {
    case "empty":
    case "not_empty":
      return 0;
    case "between":
      return 2;
    case "any_of":
    case "none_of":
    case "all_of":
      return "many";
    default:
      return 1;
  }
}

/** A condition that can't filter yet (no value picked) matches everything. */
export function isConditionActive(condition: FilterCondition) {
  const arity = operatorArity(condition.operator);
  if (arity === 0) return true;
  const values = condition.values.filter((v) => v !== "");
  return arity === 2 ? values.length === 2 : values.length > 0;
}

let counter = 0;
/** Stable-enough id for a new condition (React keys, chip focus). */
export function newConditionId() {
  counter += 1;
  return `f${Date.now().toString(36)}${counter.toString(36)}`;
}

export function createCondition(
  field: string,
  type: FilterFieldType,
  values: string[] = [],
): FilterCondition {
  return {
    id: newConditionId(),
    field,
    operator: defaultOperator(type),
    values,
  };
}

type Scalar = string | number | boolean | Date | null | undefined;
export type FilterValue = Scalar | readonly Scalar[];

function isEmptyValue(value: FilterValue): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return value === "";
}

function toStrings(value: FilterValue): string[] {
  const list: readonly Scalar[] = Array.isArray(value)
    ? (value as readonly Scalar[])
    : [value as Scalar];
  return list
    .filter((v): v is Exclude<Scalar, null | undefined> => v != null)
    .map((v) => (v instanceof Date ? v.toISOString() : String(v)));
}

/** First 10 chars of an ISO date/timestamp — comparable as a string. */
function dayOf(value: string) {
  return value.slice(0, 10);
}

/** Does one record value satisfy one condition? */
export function matchCondition(
  value: FilterValue,
  type: FilterFieldType,
  condition: FilterCondition,
): boolean {
  if (!isConditionActive(condition)) return true;
  const { operator } = condition;
  const wanted = condition.values.filter((v) => v !== "");

  if (operator === "empty") return isEmptyValue(value);
  if (operator === "not_empty") return !isEmptyValue(value);

  const have = toStrings(value);

  switch (type) {
    case "select":
    case "multiselect":
    case "boolean": {
      const overlap = have.some((v) => wanted.includes(v));
      if (operator === "any_of" || operator === "is") return overlap;
      if (operator === "none_of" || operator === "is_not") return !overlap;
      if (operator === "all_of") return wanted.every((w) => have.includes(w));
      return true;
    }
    case "text": {
      const text = have.join(" ").toLowerCase();
      const needle = (wanted[0] ?? "").toLowerCase();
      if (operator === "contains") return text.includes(needle);
      if (operator === "not_contains") return !text.includes(needle);
      if (operator === "is") return text === needle;
      if (operator === "is_not") return text !== needle;
      return true;
    }
    case "date": {
      if (have.length === 0) return false;
      const day = dayOf(have[0] ?? "");
      const [a = "", b = ""] = wanted.map(dayOf);
      if (operator === "is") return day === a;
      if (operator === "before") return day < a;
      if (operator === "after") return day > a;
      if (operator === "between") {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        return day >= lo && day <= hi;
      }
      return true;
    }
    case "number": {
      if (have.length === 0) return false;
      const n = Number(have[0]);
      const [a, b] = wanted.map(Number);
      if (Number.isNaN(n) || a === undefined || Number.isNaN(a)) return false;
      if (operator === "is") return n === a;
      if (operator === "is_not") return n !== a;
      if (operator === "gt") return n > a;
      if (operator === "lt") return n < a;
      if (operator === "between") {
        if (b === undefined || Number.isNaN(b)) return false;
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        return n >= lo && n <= hi;
      }
      return true;
    }
  }
}

/** How to read each filterable field from a record. */
export type FilterAccessors<T> = Record<
  string,
  { type: FilterFieldType; get: (item: T) => FilterValue }
>;

/** True when the record satisfies every active condition (AND). */
export function matchesFilters<T>(
  item: T,
  query: FilterQuery,
  accessors: FilterAccessors<T>,
): boolean {
  return query.every((condition) => {
    const accessor = accessors[condition.field];
    if (!accessor) return true; // unknown field (e.g. removed): ignore
    return matchCondition(accessor.get(item), accessor.type, condition);
  });
}

/**
 * Compact, URL-safe serialization: `field.op.v1,v2;field.op…`. Field ids
 * must not contain `.` or `;` (use keys like `status`, `cf_size`); values
 * may contain anything.
 */
export function encodeFilters(query: FilterQuery): string {
  return query
    .filter(isConditionActive)
    .map((c) =>
      [c.field, c.operator, c.values.map(encodeURIComponent).join(",")].join(
        ".",
      ),
    )
    .join(";");
}

const ALL_OPERATORS = new Set<string>(Object.keys(OPERATOR_LABELS));

export function decodeFilters(encoded: string | null | undefined): FilterQuery {
  if (!encoded) return [];
  const out: FilterQuery = [];
  for (const part of encoded.split(";")) {
    // Values may contain dots ("1.5"), so split on the first two only.
    const first = part.indexOf(".");
    const second = first < 0 ? -1 : part.indexOf(".", first + 1);
    if (first < 0 || second < 0) continue;
    const field = part.slice(0, first);
    const operator = part.slice(first + 1, second);
    const raw = part.slice(second + 1);
    if (!field || !ALL_OPERATORS.has(operator)) continue;
    out.push({
      id: newConditionId(),
      field: decodeURIComponent(field),
      operator: operator as FilterOperator,
      values: raw === "" ? [] : raw.split(",").map(decodeURIComponent),
    });
  }
  return out;
}

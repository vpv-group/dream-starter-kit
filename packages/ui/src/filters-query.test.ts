import { describe, expect, it } from "vitest";

import type { FilterAccessors, FilterCondition } from "./filters-query";
import {
  createCondition,
  decodeFilters,
  encodeFilters,
  isConditionActive,
  matchCondition,
  matchesFilters,
} from "./filters-query";

const c = (
  field: string,
  operator: FilterCondition["operator"],
  values: string[] = [],
): FilterCondition => ({ id: field + operator, field, operator, values });

describe("matchCondition", () => {
  it("treats a condition without values as inactive (matches all)", () => {
    expect(isConditionActive(c("status", "any_of"))).toBe(false);
    expect(matchCondition("done", "select", c("status", "any_of"))).toBe(true);
    expect(isConditionActive(c("due", "between", ["2026-01-01"]))).toBe(false);
  });

  it("select: any_of / none_of / empty", () => {
    expect(
      matchCondition("done", "select", c("s", "any_of", ["done", "x"])),
    ).toBe(true);
    expect(matchCondition("todo", "select", c("s", "any_of", ["done"]))).toBe(
      false,
    );
    expect(matchCondition("todo", "select", c("s", "none_of", ["done"]))).toBe(
      true,
    );
    expect(matchCondition(null, "select", c("s", "none_of", ["done"]))).toBe(
      true,
    );
    expect(matchCondition(null, "select", c("s", "empty"))).toBe(true);
    expect(matchCondition("", "select", c("s", "empty"))).toBe(true);
    expect(matchCondition("a", "select", c("s", "not_empty"))).toBe(true);
  });

  it("multiselect: any_of / all_of / none_of / empty arrays", () => {
    const labels = ["bug", "documentation"];
    expect(
      matchCondition(labels, "multiselect", c("l", "any_of", ["bug", "x"])),
    ).toBe(true);
    expect(
      matchCondition(
        labels,
        "multiselect",
        c("l", "all_of", ["bug", "documentation"]),
      ),
    ).toBe(true);
    expect(
      matchCondition(labels, "multiselect", c("l", "all_of", ["bug", "x"])),
    ).toBe(false);
    expect(
      matchCondition(labels, "multiselect", c("l", "none_of", ["bug"])),
    ).toBe(false);
    expect(matchCondition([], "multiselect", c("l", "empty"))).toBe(true);
    expect(matchCondition([], "multiselect", c("l", "any_of", ["bug"]))).toBe(
      false,
    );
  });

  it("text: case-insensitive contains", () => {
    expect(
      matchCondition("Fix Login", "text", c("t", "contains", ["login"])),
    ).toBe(true);
    expect(
      matchCondition("Fix Login", "text", c("t", "not_contains", ["login"])),
    ).toBe(false);
    expect(matchCondition("abc", "text", c("t", "is", ["ABC"]))).toBe(true);
  });

  it("date: compares calendar days, timestamps included", () => {
    expect(
      matchCondition("2026-03-10", "date", c("d", "before", ["2026-03-11"])),
    ).toBe(true);
    expect(
      matchCondition(
        "2026-03-10T23:00:00Z",
        "date",
        c("d", "is", ["2026-03-10"]),
      ),
    ).toBe(true);
    expect(
      matchCondition("2026-03-10", "date", c("d", "after", ["2026-03-10"])),
    ).toBe(false);
    expect(
      matchCondition(
        "2026-03-10",
        "date",
        c("d", "between", ["2026-03-31", "2026-03-01"]),
      ),
    ).toBe(true);
    expect(matchCondition(null, "date", c("d", "before", ["2026-03-11"]))).toBe(
      false,
    );
  });

  it("number: comparisons and between", () => {
    expect(matchCondition(5, "number", c("n", "gt", ["3"]))).toBe(true);
    expect(matchCondition(5, "number", c("n", "lt", ["3"]))).toBe(false);
    expect(matchCondition(5, "number", c("n", "between", ["10", "1"]))).toBe(
      true,
    );
    expect(matchCondition("x", "number", c("n", "is", ["1"]))).toBe(false);
  });

  it("boolean: is", () => {
    expect(matchCondition(true, "boolean", c("b", "is", ["true"]))).toBe(true);
    expect(matchCondition(false, "boolean", c("b", "is", ["true"]))).toBe(
      false,
    );
  });
});

describe("matchesFilters", () => {
  interface Task {
    status: string;
    labels: string[];
    due: string | null;
  }
  const accessors: FilterAccessors<Task> = {
    status: { type: "select", get: (t) => t.status },
    labels: { type: "multiselect", get: (t) => t.labels },
    due: { type: "date", get: (t) => t.due },
  };
  const task: Task = { status: "ready", labels: ["bug"], due: "2026-05-02" };

  it("ANDs conditions and ignores unknown fields", () => {
    expect(
      matchesFilters(
        task,
        [
          c("status", "any_of", ["ready"]),
          c("labels", "any_of", ["bug"]),
          c("gone", "any_of", ["x"]),
        ],
        accessors,
      ),
    ).toBe(true);
    expect(
      matchesFilters(
        task,
        [c("status", "any_of", ["ready"]), c("due", "after", ["2026-06-01"])],
        accessors,
      ),
    ).toBe(false);
  });
});

describe("encode / decode", () => {
  it("round-trips, dropping inactive conditions", () => {
    const query = [
      c("labels", "any_of", ["good first issue", "a,b;c.d"]),
      c("points", "between", ["1.5", "3"]),
      c("due", "empty"),
      c("status", "any_of"),
    ];
    const decoded = decodeFilters(encodeFilters(query));
    expect(
      decoded.map(({ field, operator, values }) => ({
        field,
        operator,
        values,
      })),
    ).toEqual([
      {
        field: "labels",
        operator: "any_of",
        values: ["good first issue", "a,b;c.d"],
      },
      { field: "points", operator: "between", values: ["1.5", "3"] },
      { field: "due", operator: "empty", values: [] },
    ]);
  });

  it("skips malformed parts", () => {
    expect(decodeFilters("nope;status.bogus.x;status.any_of.a")).toHaveLength(
      1,
    );
    expect(decodeFilters("")).toEqual([]);
  });

  it("createCondition uses the type's default operator", () => {
    expect(createCondition("labels", "multiselect").operator).toBe("any_of");
    expect(createCondition("due", "date").operator).toBe("is");
  });
});

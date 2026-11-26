"use client";

import type {
  ColumnDef,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import * as React from "react";
import {
  columnVisibilityFeature,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  Columns3Icon,
} from "lucide-react";

import { Button } from "./button";
import { Checkbox } from "./checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { cn } from "./index";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

export type SortValue = string | number | Date | boolean | null | undefined;

/** A column, described without exposing the table engine. */
export interface DataTableColumn<T> {
  id: string;
  /** Header content; a string doubles as the Columns-menu label. */
  header: React.ReactNode;
  /** Columns-menu label when `header` isn't a string. */
  label?: string;
  cell: (row: T) => React.ReactNode;
  /** Makes the column sortable (client-side, or reported for server sort). */
  sortValue?: (row: T) => SortValue;
  /** `end` right-aligns (numbers, §1.6). */
  align?: "start" | "end";
  /** Hideable from the Columns menu (default true). */
  enableHiding?: boolean;
  /** Start hidden. */
  defaultHidden?: boolean;
  className?: string;
  headerClassName?: string;
}

/** Pre-grouped rows. A record may appear in several groups (e.g. labels). */
export interface DataTableGroup<T> {
  key: string;
  label: React.ReactNode;
  rows: T[];
}

export interface DataTableSort {
  id: string;
  desc: boolean;
}

/** Server-side paging: the table shows `rows` as one page of `rowCount`. */
export interface DataTableServerPagination {
  pageIndex: number;
  pageSize: number;
  rowCount: number;
  onChange: (next: { pageIndex: number; pageSize: number }) => void;
}

interface Wrapped<T> {
  /** Unique per rendered row (group-qualified). */
  rid: string;
  /** The record's own key (selection identity). */
  key: string;
  group: string | null;
  original: T;
}

const features = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: {
    basic: sortFn_basic,
    text: sortFn_text,
    datetime: sortFn_datetime,
  },
});

type Features = typeof features;

const PAGE_SIZES = [10, 25, 50, 100];
const EMPTY: never[] = [];

function normalizeSortValue(value: SortValue): string | number | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") return value.toLocaleLowerCase();
  return value;
}

/**
 * The data-table shell (docs/DESIGN-SYSTEM.md §4.3): toolbar strip, a
 * selection bar that *replaces* the toolbar while rows are selected,
 * sortable headers, a Columns menu, optional collapsible groups, an empty
 * row and a pagination footer. Put it in `<Card variant="framed">` →
 * `<CardContent className="p-0">` for the framed look.
 */
function DataTable<T>({
  columns,
  data,
  groups,
  getRowId,
  toolbar,
  toolbarEnd,
  selectable = false,
  selection,
  onSelectionChange,
  selectionActions,
  sorting,
  onSortingChange,
  defaultSorting,
  manualSorting = false,
  columnVisibility,
  onColumnVisibilityChange,
  pageSize: initialPageSize = 25,
  paginate = true,
  serverPagination,
  emptyMessage = "No results.",
  onRowClick,
  rowClassName,
  isLoading = false,
  className,
}: {
  columns: DataTableColumn<T>[];
  /** Flat rows. Ignored when `groups` is given. */
  data?: T[];
  /** Grouped rows (collapsible sections, no paging). */
  groups?: DataTableGroup<T>[];
  getRowId: (row: T) => string;
  /** Left side of the toolbar strip (search, filters). */
  toolbar?: React.ReactNode;
  /** Right side, before the Columns menu (view switcher, actions). */
  toolbarEnd?: React.ReactNode;
  selectable?: boolean;
  selection?: ReadonlySet<string>;
  onSelectionChange?: (next: Set<string>) => void;
  /** Actions shown in the selection bar ("Export · Change owner · Delete"). */
  selectionActions?: (rows: T[], clear: () => void) => React.ReactNode;
  sorting?: DataTableSort[];
  onSortingChange?: (next: DataTableSort[]) => void;
  defaultSorting?: DataTableSort[];
  /** Rows arrive already sorted (server sort); headers still toggle. */
  manualSorting?: boolean;
  columnVisibility?: Record<string, boolean>;
  onColumnVisibilityChange?: (next: Record<string, boolean>) => void;
  pageSize?: number;
  paginate?: boolean;
  serverPagination?: DataTableServerPagination;
  emptyMessage?: React.ReactNode;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  isLoading?: boolean;
  className?: string;
}) {
  const grouped = groups !== undefined;

  // ---- rows -------------------------------------------------------------
  const rows = React.useMemo<Wrapped<T>[]>(() => {
    if (groups) {
      return groups.flatMap((g) =>
        g.rows.map((original) => {
          const key = getRowId(original);
          return { rid: `${g.key}::${key}`, key, group: g.key, original };
        }),
      );
    }
    return (data ?? EMPTY).map((original) => {
      const key = getRowId(original);
      return { rid: key, key, group: null, original };
    });
  }, [data, groups, getRowId]);

  // ---- state (controlled or internal) -----------------------------------
  const [innerSorting, setInnerSorting] = React.useState<DataTableSort[]>(
    defaultSorting ?? [],
  );
  const sortState: SortingState = sorting ?? innerSorting;
  const setSort = (next: DataTableSort[]) => {
    if (onSortingChange) onSortingChange(next);
    if (sorting === undefined) setInnerSorting(next);
  };

  const [innerVisibility, setInnerVisibility] = React.useState<
    Record<string, boolean>
  >(() =>
    Object.fromEntries(
      columns.filter((c) => c.defaultHidden).map((c) => [c.id, false]),
    ),
  );
  const visibility = columnVisibility ?? innerVisibility;
  const setVisibility = (next: Record<string, boolean>) => {
    if (onColumnVisibilityChange) onColumnVisibilityChange(next);
    if (columnVisibility === undefined) setInnerVisibility(next);
  };

  const [innerPagination, setInnerPagination] = React.useState<PaginationState>(
    { pageIndex: 0, pageSize: initialPageSize },
  );
  const pagingOn = paginate && !grouped;
  const pagination: PaginationState = serverPagination
    ? {
        pageIndex: serverPagination.pageIndex,
        pageSize: serverPagination.pageSize,
      }
    : pagingOn
      ? innerPagination
      : { pageIndex: 0, pageSize: Math.max(rows.length, 1) };

  const [innerSelection, setInnerSelection] = React.useState<Set<string>>(
    () => new Set(),
  );
  const selected = selection ?? innerSelection;
  const setSelected = (next: Set<string>) => {
    if (onSelectionChange) onSelectionChange(next);
    if (selection === undefined) setInnerSelection(next);
  };

  // ---- engine -----------------------------------------------------------
  const columnDefs = React.useMemo<ColumnDef<Features, Wrapped<T>>[]>(
    () =>
      columns.map((col) => ({
        id: col.id,
        accessorFn: (row: Wrapped<T>) =>
          col.sortValue
            ? normalizeSortValue(col.sortValue(row.original))
            : null,
        enableSorting: !!col.sortValue,
        enableHiding: col.enableHiding ?? true,
        sortFn: "basic" as const,
        sortUndefined: "last" as const,
      })),
    [columns],
  );

  const table = useTable({
    features,
    columns: columnDefs,
    data: rows,
    getRowId: (row) => row.rid,
    state: {
      sorting: sortState,
      columnVisibility: visibility,
      pagination,
    },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sortState) : updater;
      setSort(next.map(({ id, desc }) => ({ id, desc })));
    },
    onColumnVisibilityChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(visibility) : updater;
      setVisibility(next);
    },
    onPaginationChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(pagination) : updater;
      if (serverPagination) serverPagination.onChange(next);
      else setInnerPagination(next);
    },
    manualSorting,
    manualPagination: !!serverPagination,
    rowCount: serverPagination?.rowCount,
    autoResetPageIndex: false,
  });

  const visibleColumns = columns.filter((c) => visibility[c.id] !== false);
  const pageRows = table.getRowModel().rows.map((r) => r.original);
  const colSpan = visibleColumns.length + (selectable ? 1 : 0);

  // ---- selection --------------------------------------------------------
  const uniqueKeys = React.useMemo(
    () => Array.from(new Set(pageRows.map((r) => r.key))),
    [pageRows],
  );
  const selectedOnPage = uniqueKeys.filter((k) => selected.has(k)).length;
  const allOnPage =
    uniqueKeys.length > 0 && selectedOnPage === uniqueKeys.length;
  const selectedRows = React.useMemo(() => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const r of rows) {
      if (selected.has(r.key) && !seen.has(r.key)) {
        seen.add(r.key);
        out.push(r.original);
      }
    }
    return out;
  }, [rows, selected]);
  const clearSelection = () => setSelected(new Set());
  const toggleKey = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  // ---- groups -----------------------------------------------------------
  const [collapsed, setCollapsed] = React.useState<Set<string>>(
    () => new Set(),
  );
  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const hideable = columns.filter((c) => c.enableHiding !== false);

  const renderRow = (row: Wrapped<T>) => {
    const isSelected = selected.has(row.key);
    return (
      <TableRow
        key={row.rid}
        data-state={isSelected ? "selected" : undefined}
        className={cn(
          onRowClick && "cursor-pointer",
          rowClassName?.(row.original),
        )}
        onClick={onRowClick ? () => onRowClick(row.original) : undefined}
      >
        {selectable ? (
          <TableCell
            className="w-10 pl-(--card-spacing,--spacing(4))"
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => toggleKey(row.key)}
              aria-label="Select row"
            />
          </TableCell>
        ) : null}
        {visibleColumns.map((col, i) => (
          <TableCell
            key={col.id}
            className={cn(
              col.align === "end" && "text-right tabular-nums",
              !selectable && i === 0 && "pl-(--card-spacing,--spacing(4))",
              i === visibleColumns.length - 1 &&
                "pr-(--card-spacing,--spacing(4))",
              col.className,
            )}
          >
            {col.cell(row.original)}
          </TableCell>
        ))}
      </TableRow>
    );
  };

  const body = (() => {
    if (isLoading) {
      return Array.from({ length: 5 }, (_, i) => (
        <TableRow key={`sk${i}`}>
          <TableCell
            colSpan={colSpan}
            className="px-(--card-spacing,--spacing(4))"
          >
            <div className="bg-muted h-4 animate-pulse rounded motion-reduce:animate-none" />
          </TableCell>
        </TableRow>
      ));
    }
    if (pageRows.length === 0) {
      return (
        <TableRow>
          <TableCell
            colSpan={colSpan}
            className="text-muted-foreground h-24 text-center"
          >
            {emptyMessage}
          </TableCell>
        </TableRow>
      );
    }
    if (!groups) return pageRows.map(renderRow);
    // Keep the engine's sort order inside each group.
    const order = new Map(pageRows.map((r, i) => [r.rid, i]));
    return groups.map((g) => {
      const groupRows = pageRows
        .filter((r) => r.group === g.key)
        .sort((a, b) => (order.get(a.rid) ?? 0) - (order.get(b.rid) ?? 0));
      const isCollapsed = collapsed.has(g.key);
      return (
        <React.Fragment key={g.key}>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableCell
              colSpan={colSpan}
              className="px-(--card-spacing,--spacing(4)) py-1.5"
            >
              <button
                type="button"
                onClick={() => toggleGroup(g.key)}
                aria-expanded={!isCollapsed}
                className="flex items-center gap-2 text-sm font-semibold"
              >
                <ChevronDownIcon
                  className={cn(
                    "text-muted-foreground size-4 transition-transform motion-reduce:transition-none",
                    isCollapsed && "-rotate-90",
                  )}
                />
                {g.label}
                <span className="text-muted-foreground text-xs font-normal tabular-nums">
                  {g.rows.length}
                </span>
              </button>
            </TableCell>
          </TableRow>
          {isCollapsed ? null : groupRows.map(renderRow)}
        </React.Fragment>
      );
    });
  })();

  const pageCount = table.getPageCount();
  const showFooter =
    (pagingOn || !!serverPagination) &&
    (serverPagination ? serverPagination.rowCount : rows.length) > 0;

  return (
    <div
      data-slot="data-table"
      className={cn("@container/toolbar flex min-w-0 flex-col", className)}
    >
      <div
        data-slot="data-table-toolbar"
        className="flex min-h-11 flex-wrap items-center gap-2 border-b px-(--card-spacing,--spacing(4)) py-2"
      >
        {selectable && selectedRows.length > 0 ? (
          <>
            <span className="text-sm font-medium tabular-nums">
              {selectedRows.length} selected
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {selectionActions?.(selectedRows, clearSelection)}
            </div>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {toolbar}
            </div>
            <div className="flex items-center gap-2">
              {toolbarEnd}
              {hideable.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs">
                      <Columns3Icon className="size-3.5" />
                      <span className="sr-only @2xl/toolbar:not-sr-only">
                        Columns
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Columns</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {hideable.map((col) => (
                      <DropdownMenuCheckboxItem
                        key={col.id}
                        checked={visibility[col.id] !== false}
                        onCheckedChange={(checked) =>
                          setVisibility({ ...visibility, [col.id]: !!checked })
                        }
                        onSelect={(e) => e.preventDefault()}
                      >
                        {col.label ??
                          (typeof col.header === "string"
                            ? col.header
                            : col.id)}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {selectable ? (
              <TableHead className="w-10 pl-(--card-spacing,--spacing(4))">
                <Checkbox
                  checked={
                    allOnPage
                      ? true
                      : selectedOnPage > 0
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={() => {
                    const next = new Set(selected);
                    if (allOnPage) uniqueKeys.forEach((k) => next.delete(k));
                    else uniqueKeys.forEach((k) => next.add(k));
                    setSelected(next);
                  }}
                  aria-label="Select all rows"
                />
              </TableHead>
            ) : null}
            {visibleColumns.map((col, i) => {
              const tcol = table.getColumn(col.id);
              const sorted = tcol?.getIsSorted() ?? false;
              return (
                <TableHead
                  key={col.id}
                  aria-sort={
                    sorted === "asc"
                      ? "ascending"
                      : sorted === "desc"
                        ? "descending"
                        : undefined
                  }
                  className={cn(
                    col.align === "end" && "text-right",
                    !selectable &&
                      i === 0 &&
                      "pl-(--card-spacing,--spacing(4))",
                    i === visibleColumns.length - 1 &&
                      "pr-(--card-spacing,--spacing(4))",
                    col.headerClassName,
                  )}
                >
                  {col.sortValue && tcol ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "-mx-2 h-7 gap-1 px-2 text-xs font-medium",
                        col.align === "end" && "flex-row-reverse",
                      )}
                      onClick={tcol.getToggleSortingHandler()}
                    >
                      {col.header}
                      {sorted === "asc" ? (
                        <ArrowUpIcon className="size-3.5" />
                      ) : sorted === "desc" ? (
                        <ArrowDownIcon className="size-3.5" />
                      ) : (
                        <ChevronsUpDownIcon className="text-muted-foreground size-3.5" />
                      )}
                    </Button>
                  ) : (
                    <span className="text-xs font-medium">{col.header}</span>
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>{body}</TableBody>
      </Table>

      {showFooter ? (
        <div
          data-slot="data-table-footer"
          className="flex flex-col gap-2 border-t px-(--card-spacing,--spacing(4)) py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="text-muted-foreground flex items-center gap-2">
            <span>Rows per page</span>
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(v) => table.setPageSize(Number(v))}
            >
              <SelectTrigger
                size="sm"
                className="h-7 w-18"
                aria-label="Rows per page"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="tabular-nums">
              Page {pagination.pageIndex + 1} of {Math.max(pageCount, 1)}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous page"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next page"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { DataTable };

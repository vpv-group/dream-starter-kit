"use client";

import type {
  Announcements,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  UniqueIdentifier,
} from "@dnd-kit/core";
import * as React from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { Tone } from "./status-dot";
import { Badge } from "./badge";
import { cn } from "./index";
import { StatusDot } from "./status-dot";

export interface BoardColumn<T> {
  id: string;
  title: React.ReactNode;
  items: T[];
  /** Status tone for the header dot (§5). */
  tone?: Tone;
  /** Data-driven dot colour (e.g. a label hex); wins over `tone`. */
  color?: string;
  /** Σ line under the title (`text-xs`, tabular). */
  aggregate?: React.ReactNode;
  /** Right side of the header (column menu, "+"). */
  actions?: React.ReactNode;
  /** Under the cards ("+ Add task", "Load more"). */
  footer?: React.ReactNode;
  /** Refuse drops into this column (e.g. a read-only grouping). */
  disabled?: boolean;
}

export interface BoardMove {
  itemId: string;
  fromColumn: string;
  toColumn: string;
  /** Index in the target column after the move. */
  toIndex: number;
  /** Neighbours after the move — handy for fractional positions. */
  beforeId: string | null;
  afterId: string | null;
}

interface CardState {
  isDragging: boolean;
  isOverlay: boolean;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function usePrefersReducedMotion() {
  return React.useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

function SortableCard({
  id,
  disabled,
  children,
  label,
  onOpen,
}: {
  id: string;
  disabled: boolean;
  label: string;
  onOpen?: () => void;
  children: (state: CardState) => React.ReactNode;
}) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      data-slot="board-card"
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      aria-roledescription="draggable card"
      aria-label={label}
      onKeyDown={(e) => {
        // Space picks the card up (keyboard sensor); Enter opens it.
        if (e.key === "Enter" && onOpen && !isDragging) {
          e.preventDefault();
          onOpen();
          return;
        }
        listeners?.onKeyDown?.(e);
      }}
      className={cn(
        "focus-visible:ring-ring/50 rounded-lg outline-none focus-visible:ring-[3px]",
        isDragging && "opacity-40",
      )}
    >
      {children({ isDragging, isOverlay: false })}
    </div>
  );
}

function BoardColumnView<T>({
  column,
  getItemId,
  getItemLabel,
  renderCard,
  onOpenItem,
  draggable,
}: {
  column: BoardColumn<T>;
  getItemId: (item: T) => string;
  getItemLabel: (item: T) => string;
  renderCard: (item: T, state: CardState) => React.ReactNode;
  onOpenItem?: (item: T) => void;
  draggable: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${column.id}`,
    disabled: column.disabled,
  });
  const ids = column.items.map(getItemId);

  return (
    <section
      data-slot="board-column"
      aria-label={typeof column.title === "string" ? column.title : undefined}
      className="bg-muted/40 ring-foreground/10 flex max-h-full w-[85vw] shrink-0 snap-start flex-col rounded-xl ring-1 sm:w-[340px]"
    >
      <header className="flex items-start gap-2 px-3 pt-3 pb-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            {column.color ? (
              <span
                aria-hidden
                className="inline-block size-2 shrink-0 rounded-full"
                style={{ backgroundColor: column.color }}
              />
            ) : column.tone ? (
              <StatusDot tone={column.tone} />
            ) : null}
            <h3 className="truncate text-sm font-semibold">{column.title}</h3>
            <Badge variant="outline" className="tabular-nums">
              {column.items.length}
            </Badge>
          </div>
          {column.aggregate ? (
            <div className="text-muted-foreground text-xs tabular-nums">
              {column.aggregate}
            </div>
          ) : null}
        </div>
        {column.actions}
      </header>
      <div
        ref={setNodeRef}
        data-over={isOver}
        className="data-[over=true]:bg-accent/40 flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-b-xl px-2 pb-2"
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {column.items.map((item) => {
            const id = getItemId(item);
            return (
              <SortableCard
                key={id}
                id={id}
                disabled={!draggable}
                label={getItemLabel(item)}
                onOpen={onOpenItem ? () => onOpenItem(item) : undefined}
              >
                {(state) => renderCard(item, state)}
              </SortableCard>
            );
          })}
        </SortableContext>
        {column.footer}
      </div>
    </section>
  );
}

/**
 * The board (kanban) shell (docs/DESIGN-SYSTEM.md §4.6): fixed 340px
 * columns that scroll horizontally (full-width snap columns on phones),
 * header dot + title + count + aggregate, sortable cards with pointer,
 * touch and keyboard dragging (focus a card, Space to pick up, arrows to
 * move, Space to drop, Esc to cancel; Enter opens it).
 *
 * Controlled: render `columns` from your data and apply `onMove`
 * optimistically (roll back with a toast if the write fails).
 */
function Board<T>({
  columns,
  getItemId,
  getItemLabel,
  renderCard,
  onMove,
  onOpenItem,
  canMove,
  draggable = true,
  trailing,
  className,
}: {
  columns: BoardColumn<T>[];
  getItemId: (item: T) => string;
  /** Spoken in drag announcements and the card's aria-label. */
  getItemLabel: (item: T) => string;
  renderCard: (item: T, state: CardState) => React.ReactNode;
  onMove?: (move: BoardMove) => void;
  /** Called with Enter on a focused card (pointer clicks are the card's own). */
  onOpenItem?: (item: T) => void;
  /** Veto a move (e.g. no drops into a read-only column). */
  canMove?: (move: BoardMove) => boolean;
  draggable?: boolean;
  /** After the last column ("+ Add column"). */
  trailing?: React.ReactNode;
  className?: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  // Stable id keeps dnd-kit's aria-describedby equal on server and client.
  const dndId = React.useId();
  // Working copy while dragging, so cards visibly hop between columns.
  const [working, setWorking] = React.useState<Record<string, T[]> | null>(
    null,
  );
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const origin = React.useRef<string | null>(null);

  const itemsOf = React.useCallback(
    (columnId: string) =>
      working?.[columnId] ??
      columns.find((c) => c.id === columnId)?.items ??
      [],
    [working, columns],
  );

  const byId = React.useMemo(() => {
    const map = new Map<string, T>();
    for (const c of columns)
      for (const item of c.items) map.set(getItemId(item), item);
    return map;
  }, [columns, getItemId]);

  const columnOf = (id: UniqueIdentifier): string | null => {
    const key = String(id);
    if (key.startsWith("column:")) return key.slice("column:".length);
    for (const c of columns) {
      if (itemsOf(c.id).some((item) => getItemId(item) === key)) return c.id;
    }
    return null;
  };

  const titleOf = (columnId: string | null) => {
    const t = columns.find((c) => c.id === columnId)?.title;
    return typeof t === "string" ? t : (columnId ?? "");
  };
  const labelOf = (id: UniqueIdentifier) => {
    const item = byId.get(String(id));
    return item ? getItemLabel(item) : String(id);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: {
        start: ["Space"],
        cancel: ["Escape"],
        end: ["Space", "Enter"],
      },
    }),
  );

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${labelOf(active.id)} in ${titleOf(columnOf(active.id))}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${labelOf(active.id)} is over ${titleOf(columnOf(over.id))}.`
        : `${labelOf(active.id)} is no longer over a column.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `Dropped ${labelOf(active.id)} in ${titleOf(columnOf(over.id))}.`
        : `Dropped ${labelOf(active.id)}.`,
    onDragCancel: ({ active }) =>
      `Cancelled. ${labelOf(active.id)} returned to ${titleOf(origin.current)}.`,
  };

  const snapshot = () =>
    Object.fromEntries(columns.map((c) => [c.id, [...c.items]]));

  const handleStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    origin.current = columnOf(active.id);
    setWorking(snapshot());
  };

  const handleOver = ({ active, over }: DragOverEvent) => {
    if (!over || !working) return;
    const from = columnOf(active.id);
    const to = columnOf(over.id);
    if (!from || !to || from === to) return;
    if (columns.find((c) => c.id === to)?.disabled) return;
    setWorking((prev) => {
      if (!prev) return prev;
      const source = [...(prev[from] ?? [])];
      const target = [...(prev[to] ?? [])];
      const index = source.findIndex((i) => getItemId(i) === String(active.id));
      if (index < 0) return prev;
      const [moved] = source.splice(index, 1);
      if (moved === undefined) return prev;
      const overIndex = target.findIndex(
        (i) => getItemId(i) === String(over.id),
      );
      target.splice(overIndex < 0 ? target.length : overIndex, 0, moved);
      return { ...prev, [from]: source, [to]: target };
    });
  };

  const handleEnd = ({ active, over }: DragEndEvent) => {
    const fromColumn = origin.current;
    const current = working;
    setActiveId(null);
    setWorking(null);
    origin.current = null;
    if (!over || !current || !fromColumn) return;

    const toColumn = columnOf(over.id);
    if (!toColumn || columns.find((c) => c.id === toColumn)?.disabled) return;
    const id = String(active.id);
    const list = [...(current[toColumn] ?? [])];
    const oldIndex = list.findIndex((i) => getItemId(i) === id);
    if (oldIndex < 0) return;
    const overIndex = list.findIndex((i) => getItemId(i) === String(over.id));
    const toIndex = overIndex < 0 ? oldIndex : overIndex;
    const [moved] = list.splice(oldIndex, 1);
    if (moved === undefined) return;
    list.splice(toIndex, 0, moved);

    const original = columns.find((c) => c.id === fromColumn)?.items ?? [];
    const originalIndex = original.findIndex((i) => getItemId(i) === id);
    if (fromColumn === toColumn && originalIndex === toIndex) return;

    const before = list[toIndex - 1];
    const after = list[toIndex + 1];
    const move: BoardMove = {
      itemId: id,
      fromColumn,
      toColumn,
      toIndex,
      beforeId: before === undefined ? null : getItemId(before),
      afterId: after === undefined ? null : getItemId(after),
    };
    if (canMove && !canMove(move)) return;
    onMove?.(move);
  };

  const active = activeId ? byId.get(activeId) : undefined;
  const view = columns.map((c) =>
    working ? { ...c, items: working[c.id] ?? c.items } : c,
  );

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCorners}
      accessibility={{ announcements }}
      onDragStart={handleStart}
      onDragOver={handleOver}
      onDragEnd={handleEnd}
      onDragCancel={() => {
        setActiveId(null);
        setWorking(null);
      }}
    >
      <div
        data-slot="board"
        className={cn(
          "flex min-h-0 snap-x snap-mandatory gap-4 overflow-x-auto pb-2 sm:snap-none",
          className,
        )}
      >
        {view.map((column) => (
          <BoardColumnView
            key={column.id}
            column={column}
            getItemId={getItemId}
            getItemLabel={getItemLabel}
            renderCard={renderCard}
            onOpenItem={onOpenItem}
            draggable={draggable && !!onMove}
          />
        ))}
        {trailing}
      </div>
      <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
        {active !== undefined
          ? renderCard(active, { isDragging: true, isOverlay: true })
          : null}
      </DragOverlay>
    </DndContext>
  );
}

/** The card surface used on boards (inset panel, §4.6). */
function BoardCard({
  className,
  isOverlay,
  ...props
}: React.ComponentProps<"div"> & { isOverlay?: boolean }) {
  return (
    <div
      data-slot="board-card-surface"
      className={cn(
        "bg-card ring-foreground/5 flex flex-col gap-2 rounded-lg p-3 text-sm shadow-2xs ring-1",
        isOverlay && "rotate-1 shadow-lg",
        className,
      )}
      {...props}
    />
  );
}

export { Board, BoardCard };

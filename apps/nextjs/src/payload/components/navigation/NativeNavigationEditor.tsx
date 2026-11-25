"use client";

import type { DragEndEvent } from "@dnd-kit/core";
import type { CSSProperties } from "react";
import { createElement, useEffect, useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, toast, useConfig } from "@payloadcms/ui";
import {
  IconGripVertical,
  IconMenu2,
  IconNews,
  IconSearch,
  IconUserCircle,
} from "@tabler/icons-react";

import type { NativeNavigation, NavItem } from "@acme/cms";
import { NATIVE_HOME_HREF } from "@acme/app";

import { resolveNavIcon } from "~/components/nav-icons";

/**
 * Below the Navigation table (collection `afterList`): the "iOS and
 * Android App" section. Staff drag the native menu rows into order, pick a
 * 3- or 4-tab bar, and hide rows on native (deep link only). The first N
 * visible rows are the tab bar; every visible row is listed on the app's
 * More (Android) / Search (iOS) screen, so the rest are reachable there. Saved to the versioned
 * `native-navigation` global (draft → publish); the app picks up the
 * published version on its next launch — no app release needed.
 *
 * Built from Payload's own UI + dnd-kit (already Payload's drag library);
 * layout rules live in app/(payload)/custom.css (`.kit-nav-*`).
 */

interface Row {
  id: number | string;
  key: string;
  label: string;
  href: string;
  icon?: string | null;
  enabled: boolean;
  hidden: boolean;
  sfSymbol?: string | null;
  materialIcon?: string | null;
}

type TabCount = "3" | "4";

const HREF_ICONS: Record<string, typeof IconNews> = {
  "/content/posts": IconNews,
  "/profile": IconUserCircle,
};

function rowIcon(row: Pick<Row, "icon" | "href">) {
  if (row.icon) return resolveNavIcon(row.icon);
  return HREF_ICONS[row.href] ?? resolveNavIcon(undefined);
}

/** The row's (web) icon as an element — the closest preview of its native icon. */
function renderRowIcon(
  row: Pick<Row, "icon" | "href" | "sfSymbol">,
  size: number,
) {
  // The app's home screen wears the app logo on native (unless overridden) —
  // same rule as resolveNativeIcon in @acme/app.
  if (row.href === NATIVE_HOME_HREF && !row.sfSymbol?.trim()) {
    return (
      <span
        className="kit-nav-native__logo"
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }
  return createElement(rowIcon(row), { size, "aria-hidden": true });
}

/** Apple HIG: tab labels should be short, ideally one word. */
function longTabLabel(label: string): boolean {
  return label.trim().includes(" ") || label.trim().length > 12;
}

function relId(
  value: number | string | { id: number | string } | null | undefined,
): number | string | undefined {
  if (value === null || value === undefined) return undefined;
  return typeof value === "object" ? value.id : value;
}

/** Native menu rows in the global's order (unlisted rows appended). */
async function fetchNativeMenu(apiBase: string): Promise<{
  rows: Row[];
  tabCount: TabCount;
  status: "draft" | "published" | null;
}> {
  const [navRes, globalRes] = await Promise.all([
    fetch(
      `${apiBase}/nav-items?limit=200&sort=_order&depth=1&where[platforms][in]=native`,
      { credentials: "include" },
    ),
    fetch(`${apiBase}/globals/native-navigation?draft=true&depth=0`, {
      credentials: "include",
    }),
  ]);
  if (!navRes.ok || !globalRes.ok) throw new Error("Couldn't load menus");
  const nav = (await navRes.json()) as { docs: NavItem[] };
  const global = (await globalRes.json()) as NativeNavigation;

  const byId = new Map(nav.docs.map((d) => [String(d.id), d]));
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const r of global.items ?? []) {
    const id = relId(r.item);
    const doc = id === undefined ? undefined : byId.get(String(id));
    if (!doc || seen.has(String(doc.id))) continue;
    seen.add(String(doc.id));
    rows.push(toRow(doc, r));
  }
  for (const doc of nav.docs) {
    if (!seen.has(String(doc.id))) rows.push(toRow(doc));
  }
  return {
    rows,
    tabCount: global.tabCount === "3" ? "3" : "4",
    status: global.updatedAt ? (global._status ?? "published") : null,
  };
}

export function NativeNavigationEditor() {
  const {
    config: {
      serverURL,
      routes: { api },
    },
  } = useConfig();
  const apiBase = `${serverURL}${api}`;

  const [rows, setRows] = useState<Row[] | null>(null);
  const [tabCount, setTabCount] = useState<TabCount>("4");
  const [status, setStatus] = useState<"draft" | "published" | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchNativeMenu(apiBase).then(
      (loaded) => {
        if (cancelled) return;
        setRows(loaded.rows);
        setTabCount(loaded.tabCount);
        setStatus(loaded.status);
        setDirty(false);
        setError(null);
      },
      (e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Couldn't load menus");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [apiBase, reloadKey]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const change = (next: Row[]) => {
    setRows(next);
    setDirty(true);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!rows || !over || active.id === over.id) return;
    const from = rows.findIndex((r) => String(r.id) === String(active.id));
    const to = rows.findIndex((r) => String(r.id) === String(over.id));
    if (from === -1 || to === -1) return;
    change(arrayMove(rows, from, to));
  };

  // Placement of each row: tab slot (1-based), "more", or "hidden".
  const placement = useMemo(() => {
    const out = new Map<string, number | "more" | "hidden" | "off">();
    let slot = 0;
    for (const r of rows ?? []) {
      if (!r.enabled) out.set(String(r.id), "off");
      else if (r.hidden) out.set(String(r.id), "hidden");
      else if (slot < Number(tabCount)) out.set(String(r.id), ++slot);
      else out.set(String(r.id), "more");
    }
    return out;
  }, [rows, tabCount]);

  const visible = (rows ?? []).filter((r) => r.enabled && !r.hidden);
  const tabs = visible.slice(0, Number(tabCount));
  const moreCount = visible.length - tabs.length;
  // Index (in `rows`) after which the tab bar ends — where the divider goes.
  const lastTabId = tabs.at(-1)?.id;

  const save = async (publish: boolean) => {
    if (!rows) return;
    setSaving(publish ? "publish" : "draft");
    try {
      const res = await fetch(
        `${apiBase}/globals/native-navigation${publish ? "" : "?draft=true"}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tabCount,
            items: rows.map((r) => ({
              item: r.id,
              hidden: r.hidden,
              sfSymbol: r.sfSymbol?.trim() ? r.sfSymbol.trim() : null,
              materialIcon: r.materialIcon?.trim()
                ? r.materialIcon.trim()
                : null,
            })),
            _status: publish ? "published" : "draft",
          }),
        },
      );
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setDirty(false);
      setStatus(publish ? "published" : "draft");
      toast.success(
        publish
          ? "Published. The app shows the new menu next time it opens."
          : "Draft saved. Publish to send it to the app.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="gutter gutter--left gutter--right">
      <section className="kit-nav-section kit-nav-native">
        <header>
          <h2 className="kit-nav-section__title">iOS and Android App</h2>
          <p className="kit-nav-section__hint">
            The native app&apos;s bottom tab bar. Drag to reorder: the first{" "}
            {tabCount} visible items are tabs. Every visible item is listed
            under <strong>Search</strong> on iOS and <strong>More</strong> on
            Android, so the rest are reachable there. Hidden items stay
            reachable by link only. Changes reach the app the next time it
            opens, with no app update.
          </p>
        </header>

        {error && (
          <p className="kit-nav-native__error" role="alert">
            {error}{" "}
            <button type="button" onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </button>
          </p>
        )}

        {rows && (
          <div className="kit-nav-native__body">
            <div className="kit-nav-native__editor">
              <div
                className="kit-nav-native__tabcount"
                role="radiogroup"
                aria-label="Tabs in the tab bar"
              >
                <span>Tabs in the tab bar</span>
                {(["3", "4"] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={tabCount === n}
                    className={
                      tabCount === n
                        ? "kit-nav-native__seg kit-nav-native__seg--on"
                        : "kit-nav-native__seg"
                    }
                    onClick={() => {
                      setTabCount(n);
                      setDirty(true);
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={rows.map((r) => String(r.id))}
                  strategy={verticalListSortingStrategy}
                >
                  <ol className="kit-nav-native__list">
                    {rows.map((row) => (
                      <SortableRow
                        key={String(row.id)}
                        row={row}
                        place={placement.get(String(row.id)) ?? "more"}
                        dividerAfter={
                          lastTabId !== undefined &&
                          String(row.id) === String(lastTabId) &&
                          moreCount > 0
                        }
                        onChange={(patch) =>
                          change(
                            rows.map((r) =>
                              r.id === row.id ? { ...r, ...patch } : r,
                            ),
                          )
                        }
                      />
                    ))}
                  </ol>
                </SortableContext>
              </DndContext>

              <div className="kit-nav-native__actions">
                <span className="kit-nav-native__status">
                  {dirty
                    ? "Unsaved changes"
                    : status === "draft"
                      ? "Draft — not published to the app yet"
                      : status === "published"
                        ? "Published"
                        : "Using the default order"}
                </span>
                <Button
                  buttonStyle="secondary"
                  size="small"
                  disabled={saving !== null || !dirty}
                  onClick={() => void save(false)}
                >
                  {saving === "draft" ? "Saving…" : "Save draft"}
                </Button>
                <Button
                  buttonStyle="primary"
                  size="small"
                  disabled={saving !== null || (!dirty && status !== "draft")}
                  onClick={() => void save(true)}
                >
                  {saving === "publish" ? "Publishing…" : "Publish"}
                </Button>
              </div>
            </div>

            <Preview tabs={tabs} />
          </div>
        )}
      </section>
    </div>
  );
}

function toRow(
  doc: NavItem,
  r?: {
    hidden?: boolean | null;
    sfSymbol?: string | null;
    materialIcon?: string | null;
  },
): Row {
  // A row is off when it's turned off itself or its module is disabled.
  const moduleOff =
    typeof doc.module === "object" && doc.module?.enabled === false;
  return {
    id: doc.id,
    key: doc.key,
    label: doc.label,
    href: doc.href,
    icon: doc.icon,
    enabled: doc.enabled !== false && !moduleOff,
    hidden: r?.hidden === true,
    sfSymbol: r?.sfSymbol,
    materialIcon: r?.materialIcon,
  };
}

function SortableRow({
  row,
  place,
  dividerAfter,
  onChange,
}: {
  row: Row;
  place: number | "more" | "hidden" | "off";
  dividerAfter: boolean;
  onChange: (
    patch: Partial<Pick<Row, "hidden" | "sfSymbol" | "materialIcon">>,
  ) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: String(row.id) });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const isTab = typeof place === "number";
  const badge = isTab
    ? `Tab ${place}`
    : place === "more"
      ? "List only"
      : place === "hidden"
        ? "Hidden"
        : "Turned off";

  return (
    <>
      <li
        ref={setNodeRef}
        style={style}
        className={[
          "kit-nav-native__row",
          isDragging ? "kit-nav-native__row--dragging" : "",
          place === "hidden" || place === "off"
            ? "kit-nav-native__row--muted"
            : "",
        ].join(" ")}
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="kit-nav-native__handle"
          aria-label={`Move ${row.label}`}
          {...attributes}
          {...listeners}
        >
          <IconGripVertical size={16} aria-hidden />
        </button>
        {renderRowIcon(row, 18)}
        <span className="kit-nav-native__label">
          {row.label}
          <span className="kit-nav-native__href">{row.href}</span>
          {isTab && longTabLabel(row.label) && (
            <span className="kit-nav-native__warn">
              Short, one-word labels fit the tab bar best.
            </span>
          )}
          <details className="kit-nav-native__icons">
            <summary>
              Native icons
              {row.sfSymbol || row.materialIcon ? " (custom)" : ""}
            </summary>
            <label>
              iOS SF Symbol
              <input
                type="text"
                value={row.sfSymbol ?? ""}
                placeholder="Automatic, e.g. bell.fill"
                onChange={(e) => onChange({ sfSymbol: e.target.value })}
              />
            </label>
            <label>
              Android Material Symbol
              <input
                type="text"
                value={row.materialIcon ?? ""}
                placeholder="Automatic, e.g. notifications"
                onChange={(e) => onChange({ materialIcon: e.target.value })}
              />
            </label>
          </details>
        </span>
        <span
          className={`kit-nav-native__badge kit-nav-native__badge--${isTab ? "tab" : place}`}
        >
          {badge}
        </span>
        <label className="kit-nav-native__toggle">
          <input
            type="checkbox"
            checked={row.hidden}
            disabled={place === "off"}
            onChange={(e) => onChange({ hidden: e.target.checked })}
          />
          Hide on native
        </label>
      </li>
      {dividerAfter && (
        <li className="kit-nav-native__divider" aria-hidden>
          Only in the Search / More list
        </li>
      )}
    </>
  );
}

/**
 * A rough sketch of the bar on each platform: iOS 26's Liquid Glass tab
 * group with the separate Search button, and Android's Material bar with More.
 */
function Preview({ tabs }: { tabs: Row[] }) {
  return (
    <div className="kit-nav-native__previews" aria-label="Tab bar preview">
      <figure className="kit-nav-preview kit-nav-preview--ios">
        <div className="kit-nav-preview__screen">
          <div className="kit-nav-preview__ios-bar">
            <div className="kit-nav-preview__glass kit-nav-preview__glass--group">
              {tabs.map((t, i) => {
                return (
                  <span
                    key={String(t.id)}
                    className={
                      i === 0
                        ? "kit-nav-preview__tab kit-nav-preview__tab--on"
                        : "kit-nav-preview__tab"
                    }
                  >
                    {renderRowIcon(t, 18)}
                    <span>{t.label}</span>
                  </span>
                );
              })}
            </div>
            <div className="kit-nav-preview__glass kit-nav-preview__glass--search">
              <IconSearch size={18} aria-hidden />
            </div>
          </div>
        </div>
        <figcaption>iOS</figcaption>
      </figure>
      <figure className="kit-nav-preview kit-nav-preview--ios">
        <div className="kit-nav-preview__screen">
          <div className="kit-nav-preview__ios-bar">
            <div className="kit-nav-preview__glass kit-nav-preview__glass--search kit-nav-preview__tab--on">
              {tabs[0] ? (
                renderRowIcon(tabs[0], 18)
              ) : (
                <IconMenu2 size={18} aria-hidden />
              )}
            </div>
            <div className="kit-nav-preview__glass kit-nav-preview__glass--field">
              <IconSearch size={16} aria-hidden />
              <span>Search</span>
            </div>
          </div>
        </div>
        <figcaption>iOS, Search open</figcaption>
      </figure>
      <figure className="kit-nav-preview kit-nav-preview--android">
        <div className="kit-nav-preview__screen">
          <div className="kit-nav-preview__md-bar">
            {[...tabs, null].map((t, i) => {
              return (
                <span
                  key={t ? String(t.id) : "more"}
                  className={
                    i === 0
                      ? "kit-nav-preview__tab kit-nav-preview__tab--on"
                      : "kit-nav-preview__tab"
                  }
                >
                  {t ? (
                    renderRowIcon(t, 18)
                  ) : (
                    <IconMenu2 size={18} aria-hidden />
                  )}
                  <span>{t ? t.label : "More"}</span>
                </span>
              );
            })}
          </div>
        </div>
        <figcaption>Android</figcaption>
      </figure>
    </div>
  );
}

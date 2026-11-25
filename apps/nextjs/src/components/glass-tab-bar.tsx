"use client";

import {
  createElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconSearch, IconX } from "@tabler/icons-react";

import type { NavMenuItem } from "~/lib/mod/nav-types";
import { resolveNavIcon } from "~/components/nav-icons";
import { activeHref } from "~/lib/mod/web-tab-menu-core";
import styles from "./glass-tab-bar.module.css";

/**
 * Bottom tab bar for the signed-in web app on phones and tablets (hidden at
 * `lg`, where the sidebar takes over; the top header is unchanged). It shows
 * the same menu as the iOS + Android tab bar — staff configure both on
 * /admin → Navigation → "iOS and Android App" (tab count, order, hidden rows);
 * see lib/mod/web-tab-menu.ts.
 *
 * Like iOS 26, the trailing round Search button turns the bar into a search
 * field: the tabs collapse into one button that returns to the current tab,
 * and a sheet above lists every menu entry, filtered as you type (the native
 * Search / More screen).
 *
 * Styling follows the Liquid Glass spec in docs/DESIGN-SYSTEM.md (Bottom tab
 * bar): glass on pseudo-elements, brand --primary as the active tint.
 */
export function GlassTabBar({
  tabs,
  all,
  routes = [],
}: {
  tabs: NavMenuItem[];
  all: NavMenuItem[];
  /**
   * Other menu entries (the web sidebar's), so a page that isn't in this
   * menu doesn't light up a parent tab: `/a/notifications` is not Home.
   */
  routes?: { href: string }[];
}) {
  const pathname = usePathname();
  const active = activeHref([...all, ...routes], pathname);
  const activeIndex = tabs.findIndex((t) => t.href === active);

  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const searchButton = useRef<HTMLButtonElement>(null);

  // ── Sliding selection indicator ──────────────────────────────────
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [indicator, setIndicator] = useState<{
    x: number;
    width: number;
  } | null>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    if (searching) return;
    const measure = () => {
      const el = activeIndex >= 0 ? tabRefs.current[activeIndex] : null;
      setIndicator(el ? { x: el.offsetLeft, width: el.offsetWidth } : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeIndex, searching, tabs.length]);

  // First placement (and returning from search) doesn't animate.
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    if (!indicator || placed.current) return;
    placed.current = true;
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setAnimate(true)),
    );
    return () => cancelAnimationFrame(id);
  }, [indicator]);

  // ── Search mode ──────────────────────────────────────────────────
  const openSearch = () => {
    setQuery("");
    setSearching(true);
  };
  const closeSearch = (returnFocus: boolean) => {
    setSearching(false);
    setQuery("");
    placed.current = false;
    setAnimate(false);
    if (returnFocus) requestAnimationFrame(() => searchButton.current?.focus());
  };

  useEffect(() => {
    if (!searching) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setSearching(false);
        setQuery("");
        placed.current = false;
        setAnimate(false);
        requestAnimationFrame(() => searchButton.current?.focus());
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [searching]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? all.filter((e) => e.label.toLowerCase().includes(q)) : all;
  }, [all, query]);

  if (tabs.length === 0) return null;

  const backTab = tabs[activeIndex >= 0 ? activeIndex : 0] ?? tabs[0];
  // createElement, not <BackIcon />: the icon is looked up by name, and the
  // React Compiler lint rejects components resolved during render.
  const backIcon = createElement(resolveNavIcon(backTab?.icon), {
    "aria-hidden": true,
  });

  return (
    <>
      {searching && (
        <div className={styles.layer}>
          <div
            className={styles.scrim}
            onPointerDown={() => closeSearch(false)}
          />
          <div
            className={styles.sheet}
            role="dialog"
            aria-modal="false"
            aria-labelledby="tabbar-search-title"
          >
            <h2 id="tabbar-search-title" className={styles.sheetTitle}>
              {query.trim() ? "Results" : "All"}
            </h2>
            <ul className={styles.list} id="tabbar-search-results">
              {results.length === 0 ? (
                <li className={styles.empty}>No matches.</li>
              ) : (
                results.map((item) => {
                  const Icon = resolveNavIcon(item.icon);
                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        className={styles.row}
                        aria-current={item.href === active ? "page" : undefined}
                        onClick={() => closeSearch(false)}
                      >
                        <span
                          className={styles.tile}
                          style={{ background: tileColor(item.key) }}
                          aria-hidden
                        >
                          <Icon />
                        </span>
                        {item.label}
                      </Link>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      )}

      <nav className={styles.root} aria-label="Main">
        {searching ? (
          <>
            <button
              type="button"
              className={`${styles.glass} ${styles.round} ${styles.roundAccent} ${styles.collapsed}`}
              aria-label={`Back to ${backTab?.label ?? "app"}`}
              onClick={() => closeSearch(true)}
            >
              {backIcon}
            </button>
            <div className={`${styles.glass} ${styles.field}`} role="search">
              <IconSearch aria-hidden />
              <input
                type="search"
                className={styles.input}
                placeholder="Search"
                aria-label="Search the app"
                aria-controls="tabbar-search-results"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                autoComplete="off"
                enterKeyHint="go"
                onKeyDown={(e) => {
                  const first = results[0];
                  if (e.key === "Enter" && query.trim() && first) {
                    e.preventDefault();
                    document
                      .querySelector<HTMLAnchorElement>(
                        `#tabbar-search-results a[href="${first.href}"]`,
                      )
                      ?.click();
                  }
                }}
              />
              {query && (
                <button
                  type="button"
                  className={styles.clear}
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                >
                  <IconX aria-hidden />
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className={`${styles.glass} ${styles.tabbar}`}>
              <span
                aria-hidden
                className={`${styles.indicator} ${animate ? "" : styles.indicatorStatic}`}
                style={
                  indicator
                    ? {
                        width: indicator.width,
                        transform: `translateX(${indicator.x}px)`,
                      }
                    : { opacity: 0 }
                }
              />
              {tabs.map((tab, i) => {
                const Icon = resolveNavIcon(tab.icon);
                return (
                  <Link
                    key={tab.key}
                    href={tab.href}
                    ref={(el) => {
                      tabRefs.current[i] = el;
                    }}
                    className={styles.tab}
                    aria-current={i === activeIndex ? "page" : undefined}
                  >
                    <Icon aria-hidden />
                    <span className={styles.tabLabel}>{tab.label}</span>
                  </Link>
                );
              })}
            </div>
            <button
              ref={searchButton}
              type="button"
              className={`${styles.glass} ${styles.round}`}
              aria-label="Search"
              aria-haspopup="dialog"
              aria-expanded={false}
              onClick={openSearch}
            >
              <IconSearch aria-hidden />
            </button>
          </>
        )}
      </nav>
    </>
  );
}

/** System-colour tiles behind each glyph (same palette as native More). */
const TILE_COLORS = [
  "#0A84FF",
  "#30D158",
  "#5E5CE6",
  "#FF9F0A",
  "#FF375F",
  "#BF5AF2",
  "#FF453A",
  "#32ADE6",
];

function tileColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length] ?? "#0A84FF";
}

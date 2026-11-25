"use client";

import type { ReactNode } from "react";
import { Fragment, useState } from "react";
import { usePathname } from "next/navigation";
import {
  AnimateHeight,
  BrowseByFolderButton,
  ChevronIcon,
  GearIcon,
  Link,
  Popup,
  useConfig,
  useNav,
  usePreferences,
  useTranslation,
} from "@payloadcms/ui";
import { formatAdminURL, PREFERENCE_KEYS } from "payload/shared";

export interface AdminNavGroup {
  label: string;
  entities: {
    slug: string;
    type: "collection" | "global";
    label: string;
  }[];
}

/**
 * The admin sidebar's collection groups as an accordion (see AdminNav.tsx).
 *
 * - Only one group is open at a time: opening a group closes the others.
 * - The group holding the current page is open on load (server-rendered, so
 *   nothing animates or flickers), and again whenever navigation lands on a
 *   page in another group. Its link is bold via Payload's active indicator.
 * - With no active page in the nav (the dashboard, a custom view), the last
 *   group the user opened stays open, from the `nav` preference.
 *
 * Markup and class names mirror Payload's NavGroup / DefaultNavClient so the
 * stock nav styles apply unchanged.
 */
export function AdminNavGroups({
  groups,
  preferredOpenGroup,
}: {
  groups: AdminNavGroup[];
  preferredOpenGroup: string | null;
}) {
  const pathname = usePathname();
  const {
    config: {
      admin: {
        routes: { browseByFolder: foldersRoute },
      },
      folders,
      routes: { admin: adminRoute },
    },
  } = useConfig();
  const { setPreference } = usePreferences();
  const { navOpen } = useNav();

  const hrefFor = (entity: AdminNavGroup["entities"][number]) =>
    formatAdminURL({
      adminRoute,
      path:
        entity.type === "global"
          ? `/globals/${entity.slug}`
          : `/collections/${entity.slug}`,
    });
  const isActive = (href: string) =>
    pathname.startsWith(href) &&
    ["/", undefined].includes(pathname[href.length]);

  const activeGroup =
    groups.find((group) =>
      group.entities.some((entity) => isActive(hrefFor(entity))),
    )?.label ?? null;

  const [openGroup, setOpenGroup] = useState<string | null>(
    activeGroup ?? preferredOpenGroup,
  );
  const [animate, setAnimate] = useState(false);

  // Navigating to a page in another group opens that group (and closes the
  // rest). Adjusting state during render, not in an effect, avoids a frame
  // with the wrong group open.
  const [lastActiveGroup, setLastActiveGroup] = useState(activeGroup);
  if (activeGroup !== lastActiveGroup) {
    setLastActiveGroup(activeGroup);
    if (activeGroup && activeGroup !== openGroup) {
      setAnimate(true);
      setOpenGroup(activeGroup);
    }
  }

  const toggle = (label: string) => {
    const next = openGroup === label ? null : label;
    setAnimate(true);
    setOpenGroup(next);
    // Keep Payload's `nav` preference in step, so the dashboard reopens the
    // group the user last had open.
    void setPreference(
      PREFERENCE_KEYS.NAV,
      {
        groups: Object.fromEntries(
          groups.map((group) => [group.label, { open: group.label === next }]),
        ),
      },
      true,
    );
  };

  const folderURL = formatAdminURL({ adminRoute, path: foldersRoute });

  return (
    <>
      {folders && folders.browseByFolder ? (
        <BrowseByFolderButton active={pathname.startsWith(folderURL)} />
      ) : null}
      {groups.map((group) => {
        const collapsed = openGroup !== group.label;
        return (
          <div
            key={group.label}
            className={[
              "nav-group",
              group.label,
              collapsed && "nav-group--collapsed",
            ]
              .filter(Boolean)
              .join(" ")}
            id={`nav-group-${group.label}`}
          >
            <button
              aria-expanded={!collapsed}
              className={`nav-group__toggle nav-group__toggle--${collapsed ? "collapsed" : "open"}`}
              onClick={() => toggle(group.label)}
              tabIndex={navOpen ? 0 : -1}
              type="button"
            >
              <div className="nav-group__label">{group.label}</div>
              <div className="nav-group__indicator">
                <ChevronIcon
                  className="nav-group__indicator"
                  direction={collapsed ? undefined : "up"}
                />
              </div>
            </button>
            <AnimateHeight
              duration={animate ? 200 : 0}
              height={collapsed ? 0 : "auto"}
            >
              <div className="nav-group__content">
                {group.entities.map((entity) => {
                  const href = hrefFor(entity);
                  const id =
                    entity.type === "global"
                      ? `nav-global-${entity.slug}`
                      : `nav-${entity.slug}`;
                  const label = (
                    <>
                      {isActive(href) ? (
                        <div className="nav__link-indicator" />
                      ) : null}
                      <span className="nav__link-label">{entity.label}</span>
                    </>
                  );
                  return pathname === href ? (
                    <div key={id} className="nav__link" id={id}>
                      {label}
                    </div>
                  ) : (
                    <Link
                      key={id}
                      className="nav__link"
                      href={href}
                      id={id}
                      prefetch={false}
                    >
                      {label}
                    </Link>
                  );
                })}
              </div>
            </AnimateHeight>
          </div>
        );
      })}
    </>
  );
}

/** Payload's settings-menu gear (not exported by @payloadcms/next). */
export function SettingsMenuButton({
  settingsMenu,
}: {
  settingsMenu: ReactNode[];
}) {
  const { t } = useTranslation();
  if (settingsMenu.length === 0) return null;
  return (
    <Popup
      button={<GearIcon ariaLabel={t("general:menu")} />}
      className="settings-menu-button"
      horizontalAlign="left"
      id="settings-menu"
      size="small"
      verticalAlign="bottom"
    >
      {settingsMenu.map((item, index) => (
        <Fragment key={`settings-menu-item-${index}`}>{item}</Fragment>
      ))}
    </Popup>
  );
}

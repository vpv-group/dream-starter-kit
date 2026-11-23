import type {
  PayloadComponent,
  PayloadRequest,
  ServerProps,
  StaticLabel,
} from "payload";
import { NavHamburger, NavWrapper } from "@payloadcms/next/client";
import { Logout } from "@payloadcms/ui";
import { RenderServerComponent } from "@payloadcms/ui/elements/RenderServerComponent";
import { groupNavItems } from "@payloadcms/ui/shared";
import { EntityType } from "payload";
import { PREFERENCE_KEYS } from "payload/shared";

import type { AdminNavGroup } from "./AdminNavClient";
import { AdminNavGroups, SettingsMenuButton } from "./AdminNavClient";

// groupNavItems types `type` with @payloadcms/ui's own EntityType enum; its
// values match payload's ("collections" / "globals").
const GLOBAL_TYPE: string = EntityType.global;

type NavPreferences = {
  groups?: Partial<Record<string, { open?: boolean }>>;
} | null;

/**
 * Custom Payload admin sidebar (`admin.components.Nav`).
 *
 * Same chrome as Payload's DefaultNav (wrapper, hamburger, before/after slots,
 * settings menu, logout), but the collection groups behave as an accordion:
 * only one group is open at a time, and on load the group holding the
 * current page is the one expanded (its link is bold via Payload's active
 * indicator). See AdminNavClient.tsx.
 *
 * DefaultNav keeps per-group open/closed state in the `nav` preference; we
 * read the same preference to pick the group to open when no page in the nav
 * is active (e.g. the dashboard).
 */
export async function AdminNav(props: ServerProps & { req?: PayloadRequest }) {
  const {
    documentSubViewType,
    i18n,
    locale,
    params,
    payload,
    permissions,
    req,
    searchParams,
    user,
    viewType,
    visibleEntities,
  } = props;

  const {
    admin: {
      components: {
        afterNav,
        afterNavLinks,
        beforeNav,
        beforeNavLinks,
        logout,
        settingsMenu,
      },
    },
    collections,
    globals,
  } = payload.config;

  const clientProps = { documentSubViewType, viewType };
  const serverProps = {
    i18n,
    locale,
    params,
    payload,
    permissions,
    searchParams,
    user,
  };
  const render = (
    Component: PayloadComponent | PayloadComponent[] | undefined,
    key?: string,
  ) =>
    RenderServerComponent({
      clientProps,
      Component,
      importMap: payload.importMap,
      key,
      serverProps,
    });

  const groups: AdminNavGroup[] = groupNavItems(
    [
      ...collections
        .filter(({ slug }) => visibleEntities?.collections.includes(slug))
        .map((entity) => ({ type: EntityType.collection, entity }) as const),
      ...globals
        .filter(({ slug }) => visibleEntities?.globals.includes(slug))
        .map((entity) => ({ type: EntityType.global, entity }) as const),
    ],
    permissions ?? {},
    i18n,
  ).map((group) => ({
    label: group.label,
    entities: group.entities.map((entity) => ({
      slug: entity.slug,
      type: String(entity.type) === GLOBAL_TYPE ? "global" : "collection",
      label: translateLabel(entity.label, i18n),
    })),
  }));

  // The group to open when no page in the nav is active (e.g. the dashboard):
  // the one the user last opened, or, before they have toggled any group,
  // the first one (Payload's default nav starts with every group open).
  const savedGroups = (await getNavPreferences(req))?.groups ?? {};
  const hasSavedGroups = groups.some((group) => group.label in savedGroups);
  const preferredOpenGroup = hasSavedGroups
    ? (groups.find((group) => savedGroups[group.label]?.open)?.label ?? null)
    : (groups[0]?.label ?? null);

  const LogoutComponent = RenderServerComponent({
    clientProps,
    Component: logout.Button,
    Fallback: Logout,
    importMap: payload.importMap,
    serverProps,
  });
  const settingsMenuItems = Array.isArray(settingsMenu)
    ? settingsMenu.map((item, index) =>
        render(item, `settings-menu-item-${index}`),
      )
    : [];

  return (
    <NavWrapper baseClass="nav">
      {render(beforeNav)}
      <nav className="nav__wrap">
        {render(beforeNavLinks)}
        <AdminNavGroups
          groups={groups}
          preferredOpenGroup={preferredOpenGroup}
        />
        {render(afterNavLinks)}
        <div className="nav__controls">
          <SettingsMenuButton settingsMenu={settingsMenuItems} />
          {LogoutComponent}
        </div>
      </nav>
      {render(afterNav)}
      <div className="nav__header">
        <div className="nav__header-content">
          <NavHamburger baseClass="nav" />
        </div>
      </div>
    </NavWrapper>
  );
}

/** A collection/global label resolved for the admin's current language. */
function translateLabel(label: StaticLabel, i18n: ServerProps["i18n"]): string {
  if (typeof label === "string") return label;
  return (
    label[i18n.language] ??
    label[i18n.fallbackLanguage] ??
    Object.values(label)[0] ??
    ""
  );
}

/** The signed-in user's `nav` preference (same lookup as Payload's DefaultNav). */
async function getNavPreferences(
  req: PayloadRequest | undefined,
): Promise<NavPreferences> {
  if (!req?.user?.collection) return null;
  const result = await req.payload.find({
    collection: "payload-preferences",
    depth: 0,
    limit: 1,
    pagination: false,
    req,
    where: {
      and: [
        { key: { equals: PREFERENCE_KEYS.NAV } },
        { "user.relationTo": { equals: req.user.collection } },
        { "user.value": { equals: req.user.id } },
      ],
    },
  });
  return (result.docs[0]?.value as NavPreferences | undefined) ?? null;
}

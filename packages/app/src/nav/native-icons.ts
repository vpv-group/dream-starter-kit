/**
 * Native tab/menu icons. Menu rows store a Tabler icon name (the web
 * sidebar's icon set, e.g. `IconClock`); native renders SF Symbols on iOS and
 * Material Symbols on Android. This map translates one into the other so a
 * staff icon change in /admin reaches every platform. Per-item overrides live
 * in the `native-navigation` global (sfSymbol / materialIcon).
 *
 * Apple HIG (tab bars): prefer filled symbols, so the SF names are `.fill`
 * variants where one exists.
 */
export interface NativeIcon {
  /** SF Symbol name (iOS). */
  sf: string;
  /** Material Symbols name (Android). */
  md: string;
}

/**
 * Icon name meaning "the app's own logo" — the native app renders its bundled
 * logo glyph (apps/expo/assets/tab-home*.png) instead of a system symbol.
 * Like Apple News, the home tab wears the app logo, so when iOS 26 collapses
 * the tabs behind the Search field, the button you came home from is the
 * app's mark.
 */
export const APP_LOGO_ICON = "app-logo";

/** The native home screen (the dashboard's `mount: "index"` screen). */
export const NATIVE_HOME_HREF = "/home";

const APP_LOGO: NativeIcon = { sf: APP_LOGO_ICON, md: APP_LOGO_ICON };

export const DEFAULT_NATIVE_ICON: NativeIcon = {
  sf: "square.grid.2x2.fill",
  md: "apps",
};

export const NATIVE_ICONS: Record<string, NativeIcon> = {
  IconHome: { sf: "house.fill", md: "home" },
  IconDashboard: { sf: "square.grid.2x2.fill", md: "dashboard" },
  IconLayoutDashboard: { sf: "square.grid.2x2.fill", md: "dashboard" },
  IconLayoutGrid: { sf: "square.grid.2x2.fill", md: "apps" },
  IconMessageCircle: { sf: "bubble.left.fill", md: "chat" },
  IconMessage: { sf: "bubble.left.fill", md: "chat" },
  IconBell: { sf: "bell.fill", md: "notifications" },
  IconClock: { sf: "clock.fill", md: "schedule" },
  IconCalendar: { sf: "calendar", md: "calendar_month" },
  IconCreditCard: { sf: "creditcard.fill", md: "credit_card" },
  IconNews: { sf: "newspaper.fill", md: "article" },
  IconArticle: { sf: "newspaper.fill", md: "article" },
  IconUser: { sf: "person.crop.circle.fill", md: "account_circle" },
  IconUserCircle: { sf: "person.crop.circle.fill", md: "account_circle" },
  IconSettings: { sf: "gearshape.fill", md: "settings" },
  IconUsers: { sf: "person.2.fill", md: "group" },
  IconBook: { sf: "book.fill", md: "menu_book" },
  IconVideo: { sf: "play.rectangle.fill", md: "smart_display" },
  IconMicrophone: { sf: "mic.fill", md: "mic" },
  IconPhoto: { sf: "photo.fill", md: "photo" },
  IconMapPin: { sf: "mappin.circle.fill", md: "location_on" },
  IconHeart: { sf: "heart.fill", md: "favorite" },
  IconStar: { sf: "star.fill", md: "star" },
  IconSearch: { sf: "magnifyingglass", md: "search" },
  IconChartBar: { sf: "chart.bar.fill", md: "bar_chart" },
  IconShoppingCart: { sf: "cart.fill", md: "shopping_cart" },
  IconFileText: { sf: "doc.text.fill", md: "description" },
  IconHelp: { sf: "questionmark.circle.fill", md: "help" },
};

/**
 * Icons for menu rows that have no Tabler icon of their own (core Posts and
 * Profile ship without one), keyed by href.
 */
const HREF_ICONS: Record<string, NativeIcon> = {
  "/": { sf: "house.fill", md: "home" },
  "/content/posts": { sf: "newspaper.fill", md: "article" },
  "/content/events": { sf: "calendar", md: "event" },
  "/profile": { sf: "person.crop.circle.fill", md: "account_circle" },
};

/**
 * Resolve a row's native icon: explicit overrides → the app logo for the home
 * screen → Tabler map → href → default.
 */
export function resolveNativeIcon(input: {
  icon?: string | null;
  href?: string | null;
  sfSymbol?: string | null;
  materialIcon?: string | null;
}): NativeIcon {
  const base =
    (input.href === NATIVE_HOME_HREF ? APP_LOGO : undefined) ??
    (input.icon ? NATIVE_ICONS[input.icon] : undefined) ??
    (input.href ? HREF_ICONS[input.href] : undefined) ??
    DEFAULT_NATIVE_ICON;
  return {
    sf: nonEmpty(input.sfSymbol) ?? base.sf,
    md: nonEmpty(input.materialIcon) ?? base.md,
  };
}

function nonEmpty(value: string | null | undefined): string | undefined {
  const v = value?.trim();
  return v === "" ? undefined : v;
}

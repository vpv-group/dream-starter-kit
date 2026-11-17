import { defineModule } from "@acme/mod-kit";

/**
 * Dashboard — the app's home surface on both platforms, claimed via mount
 * overrides (web "/a", native "index" — which marks it `system` in
 * kit-modules). Renders core quick links plus the WIDGET GRID: every
 * installed-and-enabled module's declared `widgets` component, provided by
 * the host through @acme/mod-kit/react. This is what makes the home screen
 * extensible instead of hand-edited.
 */
export default defineModule({
  slug: "dashboard",
  name: "Dashboard",
  version: "1.0.0",
  kitCompat: ">=2.0.0 <3",
  description: "The home screen: quick links + module widgets.",
  nav: {
    web: [{ title: "Dashboard", href: "/a", icon: "IconDashboard", order: 10 }],
  },
  routes: {
    web: [{ path: "", component: "DashboardPage", mount: "/a" }],
    native: [{ path: "", component: "HomeScreen", mount: "index" }],
  },
});

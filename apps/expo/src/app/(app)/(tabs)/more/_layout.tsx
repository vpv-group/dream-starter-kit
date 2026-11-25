import { TabStack } from "~/nav/slot";

/** The Search / More tab: no bell — the search field owns this screen. */
export default function MoreLayout() {
  return <TabStack bell={false} />;
}

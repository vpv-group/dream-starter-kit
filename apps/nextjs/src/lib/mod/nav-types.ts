/** A serializable menu entry passed from the (app) layout to the sidebar. */
export interface NavMenuItem {
  key: string;
  label: string;
  /**
   * Where the entry links. A group's own href (e.g. a module's home) is kept
   * for page titles and active-tab matching, but the sidebar row only opens
   * and closes the submenu; staff-made groups have none ("").
   */
  href: string;
  icon?: string;
  /** Web sidebar submenu (one level deep). Present only on groups. */
  items?: NavMenuItem[];
}

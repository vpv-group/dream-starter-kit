/**
 * Above the Navigation table (collection `beforeListTable`): the "Web App"
 * section header. The table below it is the web app's /a sidebar menu,
 * unchanged; the native app's menu is the section after the table
 * (NativeNavigationEditor).
 */
export function WebAppHeader() {
  return (
    <header className="kit-nav-section">
      <h2 className="kit-nav-section__title">Web App</h2>
      <p className="kit-nav-section__hint">
        The sidebar menu in the web app (<code>/a</code>). Drag rows to reorder;
        open a row to rename it, change its icon, limit who sees it or turn it
        off. To group items under a collapsible heading, choose{" "}
        <strong>Create New</strong> to add a group, then set{" "}
        <strong>Group</strong> on each item that belongs in it.
      </p>
    </header>
  );
}

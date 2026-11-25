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
        open a row to rename it, change its icon, limit it to staff or turn it
        off.
      </p>
    </header>
  );
}

"use client";

import { Fragment } from "react";
import Link from "next/link";
import {
  Banner,
  Button,
  CopyToClipboard,
  Drawer,
  Pill,
  useModal,
} from "@payloadcms/ui";

import type { CatalogEntry } from "./use-modules-admin";
import {
  dispatchModuleOp,
  isPaidEntry,
  useModulesAdmin,
} from "./use-modules-admin";

const DRAWER_SLUG = "install-module";

/**
 * "Install module" — the Modules list's header action (collection
 * `views.list.actions`), standing in for Payload's "Create New" (modules
 * aren't created by hand). Opens a drawer with the Dream catalog. Every
 * install dispatches module-ops and lands as a PR that merges itself once its
 * checks pass (clicking Install is the approval). Installs from a GitHub URL
 * or a ZIP are CLI-only, for module authors. Admins only.
 */
export function InstallModuleAction() {
  const { registry } = useModulesAdmin();
  const { openModal } = useModal();
  if (!registry) return null;
  return (
    <>
      <Button
        buttonStyle="pill"
        size="small"
        margin={false}
        onClick={() => openModal(DRAWER_SLUG)}
      >
        Install module
      </Button>
      <Drawer slug={DRAWER_SLUG} title="Install a module">
        <InstallModuleDrawerBody />
      </Drawer>
    </>
  );
}

function InstallModuleDrawerBody() {
  const { registry, visibleCatalog } = useModulesAdmin();
  if (!registry) return null;

  return (
    <div className="kit-modules-install">
      {!registry.githubConnected && (
        <Banner type="info">
          Connect GitHub to install modules from here: each install opens a pull
          request on your repository.{" "}
          <Link href="/admin/updates">Connect GitHub</Link>
        </Banner>
      )}

      <section className="kit-modules-install__section">
        <h3 className="kit-modules-install__title">Catalog</h3>
        {visibleCatalog.length === 0 ? (
          <p className="kit-modules-install__hint">
            The catalog couldn&apos;t be loaded right now. Try again in a
            minute.
          </p>
        ) : (
          <div className="kit-modules-catalog">
            {visibleCatalog.map((entry) => (
              <CatalogCard key={entry.slug} entry={entry} />
            ))}
          </div>
        )}
        <p className="kit-modules-install__hint">
          Building your own module? Install it from a repository or a ZIP with
          the CLI: <code>pnpm mod add &lt;url|file.zip&gt;</code>.
        </p>
      </section>
    </div>
  );
}

function CatalogCard({ entry }: { entry: CatalogEntry }) {
  const { registry, installedSlugs, isEntitled, busy } = useModulesAdmin();
  const { closeModal } = useModal();
  if (!registry) return null;

  // Everything installs as `dream:<slug>`: the registry serves it, falling
  // back to a free module's public repo (registry-first).
  const paid = isPaidEntry(entry);
  // One pill per plan. Older registries only send `plan`, the names joined
  // with " or " — split it back up.
  const plans = entry.plans?.length
    ? entry.plans
    : (entry.plan?.split(" or ").filter(Boolean) ?? []);
  const source = `dream:${entry.slug}`;
  const installable = !paid || isEntitled(entry.slug);

  let action: React.ReactNode;
  if (installedSlugs.has(entry.slug)) {
    action = (
      <Pill pillStyle="success" size="small">
        Installed
      </Pill>
    );
  } else if (!installable) {
    action = entry.pricingUrl ? (
      <Button
        el="anchor"
        url={entry.pricingUrl}
        newTab
        buttonStyle="secondary"
        size="small"
        margin={false}
      >
        Get access
      </Button>
    ) : (
      <span className="kit-modules-install__hint">
        {registry.licenseConfigured
          ? "Not included in your plan"
          : "Available once this site has its license key"}
      </span>
    );
  } else if (registry.githubConnected) {
    action = (
      <Button
        size="small"
        margin={false}
        disabled={busy}
        onClick={() =>
          void dispatchModuleOp({ op: "add", source }).then((ok) => {
            if (ok) closeModal(DRAWER_SLUG);
          })
        }
      >
        Install
      </Button>
    );
  } else {
    const command = `pnpm mod add ${source}`;
    action = (
      <span className="kit-modules-catalog__command">
        <code>{command}</code>
        <CopyToClipboard value={command} />
      </span>
    );
  }

  return (
    <article className="kit-modules-catalog__card">
      <header className="kit-modules-catalog__head">
        <strong>{entry.name}</strong>
        {entry.latest ? (
          <span className="kit-modules-catalog__version">{entry.latest}</span>
        ) : null}
        {paid && plans.length === 0 ? (
          <Pill pillStyle="light" size="small">
            Paid
          </Pill>
        ) : null}
      </header>
      {paid && plans.length > 0 ? (
        <div className="kit-modules-catalog__plans">
          Included in{" "}
          {plans.map((plan, i) => (
            <Fragment key={plan}>
              {i > 0 ? (i === plans.length - 1 ? " and " : ", ") : null}
              <Pill pillStyle="light" size="small">
                {plan}
              </Pill>
            </Fragment>
          ))}
        </div>
      ) : null}
      {entry.description ? (
        <p className="kit-modules-catalog__desc">{entry.description}</p>
      ) : null}
      <footer className="kit-modules-catalog__foot">{action}</footer>
    </article>
  );
}

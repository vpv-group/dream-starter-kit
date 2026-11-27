"use client";

import type { ComponentProps } from "react";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Banner,
  Button,
  CopyToClipboard,
  Drawer,
  Pill,
  useAuth,
  useModal,
  ViewDescription,
} from "@payloadcms/ui";
import { createPortal } from "react-dom";

import type { User } from "@acme/cms";

import type { CatalogEntry } from "./use-modules-admin";
import { hasStaffRole } from "../../access";
import {
  dispatchModuleOp,
  isPaidEntry,
  useModulesAdmin,
} from "./use-modules-admin";

const DRAWER_SLUG = "install-module";

/**
 * The Modules collection's `Description` slot: renders the description as
 * usual and puts "Install module" next to the list title, where other
 * collections show Payload's "Create New" (modules aren't created by hand,
 * and Payload has no custom slot there, so the button is portaled into the
 * list header). On the module page there is no list header: description only.
 */
export function ModulesListDescription({
  description,
}: {
  description?: ComponentProps<typeof ViewDescription>["description"];
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [titleRow, setTitleRow] = useState<Element | null>(null);
  useLayoutEffect(() => {
    setTitleRow(
      anchor.current
        ?.closest(".list-header")
        ?.querySelector(".list-header__title-and-actions") ?? null,
    );
  }, []);
  return (
    <>
      {description ? <ViewDescription description={description} /> : null}
      <span ref={anchor} hidden />
      {titleRow
        ? createPortal(
            <div className="list-header__title-actions">
              <InstallModuleAction />
            </div>,
            titleRow,
          )
        : null}
    </>
  );
}

/**
 * "Install module": opens a drawer with the Dream catalog. Every install
 * dispatches module-ops and lands as a PR that merges itself once its checks
 * pass (clicking Install is the approval). Installs from a GitHub URL or a
 * ZIP are CLI-only, for module authors.
 *
 * Shown straight away to staff (the same gate as /api/modules/*: `is_staff`
 * follows the CMS roles), from the signed-in user Payload already has, so it
 * never waits on the registry, catalog or GitHub requests; the drawer shows
 * their progress instead.
 */
export function InstallModuleAction() {
  const { user } = useAuth<User>();
  const { openModal } = useModal();
  if (!hasStaffRole(user?.roles)) return null;
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
  const { registry, registryLoaded, loaded, visibleCatalog } =
    useModulesAdmin();
  if (!registry) {
    return (
      <p className="kit-modules-install__hint">
        {registryLoaded
          ? "Modules couldn't be loaded right now. Try again in a minute."
          : "Loading modules…"}
      </p>
    );
  }

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
        {!loaded ? (
          <p className="kit-modules-install__hint">Loading the catalog…</p>
        ) : visibleCatalog.length === 0 ? (
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

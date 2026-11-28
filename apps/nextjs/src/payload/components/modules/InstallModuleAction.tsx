"use client";

import type { ComponentProps } from "react";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Banner,
  Button,
  Drawer,
  Pill,
  useAuth,
  useModal,
  ViewDescription,
} from "@payloadcms/ui";
import { createPortal } from "react-dom";

import type { User } from "@acme/cms";

import type { CatalogEntry } from "./use-modules-admin";
import { isBusy } from "~/lib/mod/install-state";
import { hasStaffRole } from "../../access";
import { ModuleInstallButton } from "./ModuleInstallButton";
import { isPaidEntry, useModulesAdmin } from "./use-modules-admin";

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
 * "Install module": opens a drawer with the Dream catalog (two columns of
 * cards). Each card's Install turns into a spinner with the install's stage
 * (preparing → checks → deploying) and then "Installed", and the drawer stays
 * open, so several
 * modules can be installed at once (clicks a few seconds apart go out as one
 * run and one PR). Modules a row requires that aren't installed install with
 * it. Every install dispatches module-ops and lands as a PR that merges
 * itself once its checks pass (clicking Install is the approval). Installs
 * from a GitHub URL or a ZIP are CLI-only, for module authors.
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
  const { registry, installedSlugs, isEntitled, installState, nameOf } =
    useModulesAdmin();
  if (!registry) return null;

  // Everything installs as `dream:<slug>`: the registry serves it, falling
  // back to a free module's public repo (registry-first).
  const paid = isPaidEntry(entry);
  // One pill per plan. Older registries only send `plan`, the names joined
  // with " or " — split it back up.
  const plans = entry.plans?.length
    ? entry.plans
    : (entry.plan?.split(" or ").filter(Boolean) ?? []);
  const installable = !paid || isEntitled(entry.slug);
  const state = installState(entry.slug);

  // Required modules: missing ones install with this one, unless one is
  // already installing on its own — then this waits for it.
  const missing = (entry.requires ?? []).filter((s) => !installedSlugs.has(s));
  const waitingFor = missing
    .filter((s) => isBusy(installState(s)) && !isBusy(state))
    .map(nameOf);
  const bringsAlong = missing.filter((s) => !isBusy(installState(s)));

  return (
    <article className="kit-modules-catalog__card">
      <header className="kit-modules-catalog__head">
        <strong>{entry.name || entry.slug}</strong>
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
      {missing.length > 0 && state.stage !== "installed" ? (
        <p className="kit-modules-install__hint">
          {bringsAlong.length > 0 && waitingFor.length === 0
            ? `Also installs ${bringsAlong.map(nameOf).join(", ")}`
            : `Requires ${missing.map(nameOf).join(", ")}`}
        </p>
      ) : null}
      <footer className="kit-modules-catalog__foot">
        <ModuleInstallButton
          slug={entry.slug}
          state={state}
          installable={installable}
          githubConnected={registry.githubConnected}
          licenseConfigured={registry.licenseConfigured}
          missingDeps={bringsAlong}
          waitingFor={waitingFor}
          {...(entry.pricingUrl ? { pricingUrl: entry.pricingUrl } : {})}
        />
      </footer>
    </article>
  );
}

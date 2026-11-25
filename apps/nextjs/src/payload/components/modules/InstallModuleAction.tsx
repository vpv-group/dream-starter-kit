"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useState } from "react";
import Link from "next/link";
import {
  Banner,
  Button,
  CopyToClipboard,
  Drawer,
  Pill,
  TextInput,
  useModal,
} from "@payloadcms/ui";

import type { CatalogEntry } from "./use-modules-admin";
import {
  dispatchModuleOp,
  isPaidEntry,
  uploadModuleZip,
  useModulesAdmin,
} from "./use-modules-admin";

const DRAWER_SLUG = "install-module";

/**
 * "Install module" — the Modules list's header action (collection
 * `views.list.actions`), standing in for Payload's "Create New" (modules
 * aren't created by hand). Opens a drawer: the catalog first (the common
 * path), then install from a GitHub URL or an uploaded ZIP. Every install
 * dispatches module-ops and lands as a PR. Admins only.
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
  const { registry, visibleCatalog, busy } = useModulesAdmin();
  const { closeModal } = useModal();
  const [url, setUrl] = useState("");
  const [zip, setZip] = useState<File | null>(null);
  if (!registry) return null;
  const opsOn = registry.opsConfigured;

  const done = (ok: boolean) => {
    if (ok) closeModal(DRAWER_SLUG);
  };

  async function onGithub(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const source = url.trim();
    if (!source) return;
    const ok = await dispatchModuleOp({ op: "add", source });
    if (ok) setUrl("");
    done(ok);
  }

  async function onZip(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!zip) return;
    done(await uploadModuleZip(zip));
  }

  return (
    <div className="kit-modules-install">
      {!opsOn && (
        <Banner type="info">
          Module ops is off, so installing from here is unavailable. Copy a
          command to install from the CLI, or{" "}
          <Link href="/admin">set up module ops</Link>.
        </Banner>
      )}

      <section className="kit-modules-install__section">
        <h3 className="kit-modules-install__title">Catalog</h3>
        {visibleCatalog.length === 0 ? (
          <p className="kit-modules-install__hint">
            {registry.catalogUrl ? (
              <>
                The catalog couldn&apos;t be loaded or has no modules. You can
                still install from a repository below.
              </>
            ) : (
              <>
                The Dream module catalog appears once module ops is set up. To
                use your own catalog, set <code>MOD_CATALOG_URL</code>.
              </>
            )}
          </p>
        ) : (
          <div className="kit-modules-catalog">
            {visibleCatalog.map((entry) => (
              <CatalogCard key={entry.slug} entry={entry} />
            ))}
          </div>
        )}
      </section>

      <section className="kit-modules-install__section">
        <h3 className="kit-modules-install__title">From a GitHub repository</h3>
        <form onSubmit={(e) => void onGithub(e)}>
          <TextInput
            path="install-module-url"
            label="Repository URL"
            placeholder="https://github.com/you/dream-mod-thing"
            description="Add #v1.2.3 to install a specific tag."
            value={url}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setUrl(e.target.value)
            }
            readOnly={!opsOn}
          />
          <Button
            type="submit"
            size="medium"
            disabled={!opsOn || busy || !url.trim()}
          >
            Install from GitHub
          </Button>
        </form>
      </section>

      <section className="kit-modules-install__section">
        <h3 className="kit-modules-install__title">From a ZIP file</h3>
        <form onSubmit={(e) => void onZip(e)}>
          <div className="field-type kit-modules-install__file">
            <label className="field-label" htmlFor="install-module-zip">
              Module archive (.zip)
            </label>
            <input
              id="install-module-zip"
              type="file"
              accept=".zip"
              disabled={!opsOn}
              onChange={(e) => setZip(e.target.files?.[0] ?? null)}
            />
            <div className="field-description">
              The archive is checksummed and re-verified before install.
            </div>
          </div>
          <Button type="submit" size="medium" disabled={!opsOn || busy || !zip}>
            Upload &amp; install
          </Button>
        </form>
      </section>
    </div>
  );
}

function CatalogCard({ entry }: { entry: CatalogEntry }) {
  const { registry, installedSlugs, isEntitled, busy } = useModulesAdmin();
  const { closeModal } = useModal();
  if (!registry) return null;

  // Paid modules distribute through the Dream registry (`dream:<slug>`),
  // free ones from their public repo.
  const paid = isPaidEntry(entry);
  const source = paid ? `dream:${entry.slug}` : entry.repo;
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
          : "Needs a license key (DREAM_LICENSE_KEY)"}
      </span>
    );
  } else if (registry.opsConfigured && source) {
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
  } else if (source) {
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
        {paid ? (
          <Pill pillStyle="light" size="small">
            {entry.plan ? `Included in ${entry.plan}` : "Paid"}
          </Pill>
        ) : null}
      </header>
      {entry.description ? (
        <p className="kit-modules-catalog__desc">{entry.description}</p>
      ) : null}
      <footer className="kit-modules-catalog__foot">{action}</footer>
    </article>
  );
}

<!-- See README → "Contributing" for the full guide. -->

## What & why

<!-- What does this change, and why? Link issues with "Closes #123". -->

## How it was tested

<!-- Commands you ran, manual steps, screenshots for UI changes. -->

## Checklist

- [ ] Ran on Node 22 (`nvm use`): `pnpm typecheck && pnpm lint && pnpm test` are green
- [ ] `pnpm -F @acme/nextjs build` (if the web app changed)
- [ ] `pnpm license:check` (if dependencies changed)
- [ ] `pnpm test:rls` (if schema/RLS changed) — new tables enable RLS + index FKs used in policies
- [ ] DB changes are a **new** migration (never edited a shipped one) + `pnpm db:gen-types`
- [ ] Env changes updated **both** `.env.example` and the zod schema in `packages/config`
- [ ] Cross-platform logic lives in `packages/`; `apps/*` stay thin
- [ ] Docs updated (README / `docs/ARCHITECTURE.md` / `docs/ERD.md`) if behavior or structure changed
- [ ] Billing / Stripe adapter / `stripe` or `@stripe/*` changed? The next release
      needs the live Stripe check before it's tagged (docs/UPDATING.md → How kit
      releases work)
- [ ] Conventional Commit title (e.g. `feat(reminders): …`)

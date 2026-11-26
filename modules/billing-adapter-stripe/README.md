# Stripe — billing's web payment provider

`billing-adapter-stripe` plugs Stripe into the [billing module](../../docs/BILLING.md)
as its web payment provider (`adapter.for: "billing"`). Setup guide:
[docs/STRIPE.md](../../docs/STRIPE.md).

| Piece                     | Where                                                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Billing provider          | `src/server/provider.ts` — hosted Checkout, portal, invoices, catalog sync, account-delete cleanup               |
| Webhook                   | `POST /api/mod/billing-adapter-stripe/webhook` (`src/server/webhook.ts`), writes through billing's core services |
| Webhook auto-registration | hourly `GET …/cron/connect` (`src/server/connect.ts`), secret in Supabase Vault                                  |
| Credentials               | `src/stripe/client.ts` — `STRIPE_SECRET_KEY` wins, else "Connect with Stripe" via the Meet Dream broker          |
| On-site payment form      | `src/web/` — Stripe Elements (lazy), `webProvider` for the paywall and `/checkout`                               |
| Embedded purchase routes  | `POST …/express-intent`, `…/guest-account`, `…/upgrade-annual` (`src/server/routes.ts`)                          |
| Settings                  | "Stripe" tab on Modules → Billing (`src/payload/settings.ts`), Stripe ids tab on Plans/Coupons                   |
| Connector panel           | `src/admin/` — connection, webhook, catalog (admin-only routes `…/admin/*`)                                      |

It owns no tables: purchases, customer links and the catalog mirror are
billing's. Removing it (`pnpm mod remove billing-adapter-stripe`) leaves billing,
`/pricing` and entitlements in place; checkout then answers "Billing not
configured" until another web provider is installed.

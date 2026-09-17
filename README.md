# Okpora

React + Vite + TypeScript e-commerce with Netlify Functions, PostgreSQL, secure customer accounts, hosted payment providers and a private admin dashboard.

**Start with PRIVATE_CONFIG/README.md. THIS IS WHERE YOU CONFIGURE YOUR PRIVATE CONNECTIONS.**

## Included

- White/dark-green responsive storefront; catalog, search suggestions, filters, galleries, variants, stock, bag, wishlist, checkout and tracking.
- Email-verified registration, salted scrypt passwords, HttpOnly sessions, recovery, profiles, addresses, orders and notifications.
- Paystack (default), Flutterwave v3 and Stripe adapters; signed webhooks, backend verification and idempotent settlement.
- Stock reservations, delivery zones/estimates, tax percentage, coupons, order timeline, transactional email queue and full-refund reconciliation.
- Protected admin overview/charts, orders/export, products, inventory, categories, customers, payments, delivery, reviews, coupons, notifications, newsletter, messages, content, settings and audit logs.
- PostgreSQL migration, draft sample seed, secure first-admin script, six functions, dependency lockfile, compiled frontend, tests and deployment guides.

This is a configurable project package. No merchant account, hosted database, email account, live secret or production deployment is included. Read DEPLOYMENT_STATUS.md for verification and boundaries.

## Download → extract → configure → deploy

1. Extract the ZIP and open `okpora`.
2. Read PRIVATE_CONFIG/NETLIFY_SETUP.md.
3. Create/connect your database and run the migration.
4. Add secrets in Netlify Environment Variables.
5. Deploy through Git import or Netlify CLI.
6. Verify your own account and securely promote it. Add real products, stock, delivery rules and policies. Complete the launch checklist.

**Dragging only dist/ onto Netlify publishes the frontend without the backend.** Use a Git build or CLI for the complete store.

## Local development

Install Node 22 LTS or later:

```sh
npm ci
npm run dev
```

Without DATABASE_URL, development uses persistent PostgreSQL-compatible PGlite in ignored `.local-db/`, with clearly labelled illustrative sample products. It does not simulate payments or create fake administrators. Registration/payment still require service connections.

For a hosted test database, copy PRIVATE_CONFIG/.env.example to the ignored root `.env`, fill test values, and run:

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Use `SITE_URL=http://localhost:5173` locally. The wrapper runs Vite and the same API handler used by Netlify. Production requires no permanently running server.

| Command | Purpose |
| --- | --- |
| npm run dev | UI + local API and background worker |
| npm run dev:ui | UI only; backend must run separately |
| npm run build | Type check, build frontend, compile six functions |
| npm test | Isolated database/security/commerce tests |
| npm run config:check | Missing configuration names, never values |
| npm run db:migrate | Versioned PostgreSQL migration |
| npm run db:seed | Categories and unpublished zero-stock sample drafts |
| npm run admin:create | Promote an existing verified account via database-owner access |
| npm run deploy | Netlify CLI build and production deployment |

## Project structure

| Folder/file | Purpose |
| --- | --- |
| PRIVATE_CONFIG/ | Every connection instruction and placeholder |
| src/ | React components, pages, contexts, hooks, customer/admin interfaces |
| server/ | Server-only API, auth, payments, orders and email |
| netlify/functions/ | API, three webhooks, scheduled maintenance and sitemap |
| database/ | Relational migration |
| scripts/ | Build, migrate, seed, admin and development tools |
| tests/ | Isolated PostgreSQL-compatible tests |
| public/ | Local images, favicon, robots.txt |
| dist/ | Included built frontend |
| netlify.toml | Build/functions/redirects/security headers/cron |

Server configuration is centralized in server/config/index.ts. Public UI configuration is in src/config/appConfig.ts. Secret reads are never imported into frontend code.

## Operational behavior

Amounts use integer minor units. The server determines prices, coupons, tax, shipping, stock and payment status. Parameterized SQL, validation, database-loaded roles, origin checks and session-bound CSRF checks protect changes.

Checkout reserves stock for 30 minutes. Settlement is atomic/idempotent. Late payments without available stock are recorded and flagged for action rather than silently overselling. The scheduled worker releases expired reservations, checks unsettled payments/refunds and drains the email outbox.

Full refunds are implemented. Partial refunds/disputes, granular staff permissions, multiple currencies/warehouses, social login, SMS/WhatsApp automation and loyalty require extensions. See PRIVATE_CONFIG/OPTIONAL_SERVICES.md.

Illustrative photos are credited in ASSET_CREDITS.md. Replace sample product details/images with an accurate representation of what you sell.

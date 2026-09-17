# Delivery status

Prepared 17 September 2026.

## Implemented

The package includes React pages, PostgreSQL data operations, real server-side authentication/authorization, catalog/admin mutations, carts/wishlists, server-priced checkout, three payment adapters, verified webhooks, atomic payment settlement, inventory reservations, orders/delivery/tracking, purchase reviews, coupons, email outbox, full-refund reconciliation, content management, CSV exports, analytics hooks and Netlify deployment configuration.

No browser redirect can mark a payment paid. No seeded customers, revenue, reviews or orders are shown as business data. Production seed products are unpublished with zero stock; a separate development database may show explicitly labelled samples.

## Verification

- TypeScript checking and production Vite build.
- All six Netlify functions compiled.
- Production dependency audit reported zero known vulnerabilities at packaging time (not a security certification).
- 33 tests against isolated PostgreSQL-compatible PGlite: auth/roles, CSRF/origin, password hashing, login cookies, carts/wishlists, catalog/admin operations, coupons/prices, reservations, duplicate settlement, payment mismatches, webhook signatures, late payments, refund-to-payment matching, CSV injection and one-use reset/session revocation.
- Local photo downloads verified; the asset researcher inspected their contents.

Tests mock provider responses and never charge money. PGlite serializes a single database connection, so managed-PostgreSQL concurrent load remains a separate production check.

## Still requires your accounts and deployment

- Hosted database provisioning, TLS connection validation and migrations.
- Real sandbox/live merchant API calls, callbacks, payment/refund transactions.
- Resend domain/DNS setup and actual delivery; Supabase bucket integration.
- Netlify deployment, cron, custom domain and HTTPS.
- Platform analytics delivery.
- Browser/visual QA: the available preview could not complete startup/browser checks. Concrete wrapper/schema-path issues found were corrected, but desktop/mobile rendering remains unverified. This package is not independently production-certified.

## Defined limits

- One configured two-decimal currency, locked after the first order. No conversion or multi-currency checkout.
- One inventory ledger per variant, no warehouses.
- Sign-in required for checkout/tracking. No weak public order-number-plus-email lookup.
- Resend is the email adapter; other services need adapters.
- Full refunds only; partial refunds/disputes need additional reconciliation.
- Owner must publish actual policies; legal guarantees are not fabricated.
- Category order uses numeric positions. Product archiving preserves historical references.
- Related products use categories, not personalized AI ranking.
- CSV exports cap at 10,000 matching rows. Public/admin lists and customer order/payment histories are paginated.
- Client-rendered product titles/structured data and store-level social metadata. Rich per-product social cards require prerendering or an HTML function.
- Background work is bounded for serverless execution; monitor queues and provider limits. High-volume operations should use a dedicated queue service.
- Analytics consent stops future application events when declined; previously loaded scripts/cookies may require a reload and provider-specific cleanup.
- Automated tests do not replace a penetration test, accessibility audit or launch checklist.

Complete PRIVATE_CONFIG/CONFIGURATION_CHECKLIST.md before accepting customers.

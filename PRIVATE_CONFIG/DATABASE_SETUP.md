# Database setup

Database schema and queries are included. A hosted database is **not provisioned or connected** in the downloaded project.

## Recommended setup: Supabase PostgreSQL

1. Create a project in your own Supabase account. Keep its database password private.
2. Open Connect and copy the PostgreSQL **transaction pooler** connection string suitable for serverless use (session pooler is also usable). Use its exact host, username, password and port. Percent-encode special characters in a password inside a URL.
3. Enter it as `DATABASE_URL` in Netlify and, temporarily, in the ignored root `.env` file when running setup scripts.
4. Install Node.js 22 LTS or later on your computer. Open a terminal in the `okpora` folder and run:

   ```sh
   npm ci
   npm run db:migrate
   npm run db:seed
   ```

5. Migration creates the private `okpora` schema, tables, constraints and indexes. The migration is versioned and safe to re-run.
6. Seed creates categories and **unpublished, zero-stock illustrative draft products**. Replace their descriptions, images, prices and stock with your own before publishing. No customer records, paid orders, ratings or admin statistics are seeded.
7. The app accesses PostgreSQL through server functions. Do **not** add `okpora` to Supabase's exposed Data API schemas. Do not enable client-side direct table access. `REVOKE ALL ON SCHEMA okpora FROM PUBLIC` is included.
8. If your database uses a provider-specific CA, download its trusted root certificate from its official dashboard and set `DATABASE_CA_CERT`. Do not switch off certificate validation. Remove SSL URL parameters that conflict with provider guidance; the adapter uses verified TLS for all remote hosts.

You may instead run `database/001_initial.sql` in your database's SQL editor for a fresh database. After success run:

```sql
INSERT INTO okpora.schema_migrations(version) VALUES ('001') ON CONFLICT DO NOTHING;
```

The SQL-editor route still needs seed data only if you want the example categories/drafts. You can create all products/categories directly in Admin instead.

## Neon or another PostgreSQL provider

Use its pooled PostgreSQL connection URL for `DATABASE_URL`. No Supabase-specific database SDK is required. Functions use parameterized SQL and at most three connections per warm function instance. Ensure the provider connection pool can support expected traffic.

## First administrator

Follow ADMIN_SETUP.md after configuring email and deploying. Create an ordinary account, verify its email, then promote it through a database-owner setup command. No public bootstrap endpoint is exposed.

## Storage is separate

For dashboard image uploads, create a **public product-image bucket** in Supabase Storage named `product-images`. Keep client upload policies closed. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `STORAGE_BUCKET` in Netlify Functions scope. Uploads pass through the admin-authorized backend, validate JPEG/PNG/WebP signatures, and return public image URLs. The browser resizes/compresses uploaded photos; use a hosted image URL if the compressed image exceeds about 130 KB. Never upload customer/private documents into this public bucket.

## Data design

Tables include users, sessions, auth tokens, addresses, products, images, variants, categories, inventory, carts, wishlists, orders/items, payments, transactions, delivery zones, shipments, status history, admin notes, reviews, coupons/usage, notifications, newsletter subscribers, contact messages, site/admin settings, audit logs, webhook event IDs, refund requests, rate limits and an email outbox.

Amounts are integer minor units (kobo/cents). Supported currencies use two decimal places. Currency is locked after the first order to prevent mixing incompatible prices/revenue. Variant inventory is the source of truth. Checkout reservations hold availability for 30 minutes; verified payment commits the stock reduction atomically. Historical product references are preserved by archiving products rather than deleting them.

## Operational basics

Enable your provider's backups, choose retention appropriate to your business, and test restoring into a separate database. The supplied connection needs schema-owner rights for migration; use a dedicated restricted runtime role after setup if your database administrator can provision one. Do not publish the owner connection string.

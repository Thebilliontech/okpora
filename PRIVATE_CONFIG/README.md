# OKPORA PRIVATE CONFIGURATION CENTER

**THIS IS WHERE YOU CONFIGURE YOUR PRIVATE CONNECTIONS**

This folder explains every external connection used by Okpora. It contains placeholders and guides, never live credentials.

For production, enter your values in:

**Netlify Dashboard → Your Okpora project → Project configuration / Site configuration → Environment variables**

Set server values for the **Functions** scope (or all scopes if your plan does not offer scope selection). Set `VITE_*` values for the **Builds** scope. Then redeploy. Server secrets never belong in React code, public files, source control, or `VITE_*` variables.

For local development, copy `.env.example` from this folder to `okpora/.env`. Edit that ignored local file. Production does **not** read an uploaded PRIVATE_CONFIG folder; Netlify injects the values securely into functions.

## Required

| Variable | Purpose | Where used |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string for a managed database/pooler | Functions and local setup scripts |
| `SITE_URL` | Exact HTTPS origin of the store, such as `https://shop.example.com`; no trailing slash or path | CSRF origin checks, callback URLs, email links, sitemap |
| `PAYMENT_PROVIDER` | `paystack` (default), `flutterwave`, or `stripe` | New checkouts |
| `RESEND_API_KEY` | Transactional email API key | Registration, recovery and order email worker |
| `EMAIL_FROM` | Verified sender, for example `Okpora <orders@your-domain.com>` | Email worker |

Checkout checks database, selected payment credentials and email configuration. Registration requires email configuration. Missing services produce real errors rather than fake success.

## Payment

| Provider | Required secrets |
| --- | --- |
| Paystack | `PAYSTACK_SECRET_KEY` |
| Flutterwave | `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_SECRET`; `FLUTTERWAVE_WEBHOOK_MODE=legacy` for the v3 `verif-hash` contract |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |

This implementation redirects to provider-hosted checkout. Browser payment public keys are **not required**; unused Paystack/Flutterwave/Stripe public-key placeholders are intentionally not requested. Read PAYMENT_SETUP.md.

## Database

`DATABASE_URL` is required. `DATABASE_CA_CERT` is optional if your provider requires its own CA certificate. Verified TLS is enforced for remote PostgreSQL hosts. No `DATABASE_ADMIN_PASSWORD`, Supabase anon key, or browser database key is used. All database access goes through the API. Read DATABASE_SETUP.md.

## Authentication

Okpora stores salted scrypt password hashes and hashed opaque session/reset tokens in PostgreSQL. It does not use JWTs or require `JWT_SECRET` / `SESSION_SECRET`. Never invent a hardcoded administrator password. `ADMIN_EMAIL` optionally pre-fills the email prompt in `npm run admin:create`; setting it does not grant any role.

Production login uses HttpOnly, Secure, SameSite=Lax cookies. Requests that change signed-in data also need a session-bound CSRF token. Roles are loaded from the database on the backend for every protected request.

## Email

`RESEND_API_KEY` and `EMAIL_FROM` are required. `ADMIN_NOTIFICATION_EMAIL` is optional for private email alerts. Admin in-app notifications are always created in the database after verified payment. The transactional outbox retries email delivery through the scheduled worker. Read EMAIL_SETUP.md.

## Analytics — public and optional

`VITE_GOOGLE_ANALYTICS_ID`, `VITE_META_PIXEL_ID`, `VITE_TIKTOK_PIXEL_ID` are optional. Tags are loaded only after the visitor accepts analytics. `VITE_SITE_URL` and `VITE_STORE_NAME` are safe public build settings; the admin-managed store name takes precedence. Read ANALYTICS_SETUP.md.

## Optional

Image uploads use `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `STORAGE_BUCKET` (default `product-images`). The service-role key stays on the server. Uploaded images are public product assets. Without this connection, use HTTPS image URLs or files in `public/`.

Runtime flags `NODE_ENV` and `NETLIFY` are supplied by the hosting/runtime environment. Do not set them to development in production. Node 22 is configured in netlify.toml.

No SMS, WhatsApp API, push, referral, loyalty or warehouse secrets are consumed by this release. Their extension points are documented in OPTIONAL_SERVICES.md. The contact WhatsApp number is a public business setting edited in Admin.

## Start here

1. DATABASE_SETUP.md
2. NETLIFY_SETUP.md
3. EMAIL_SETUP.md
4. ADMIN_SETUP.md
5. PAYMENT_SETUP.md
6. CONFIGURATION_CHECKLIST.md

Run `npm run config:check` locally to print missing variable **names only**. Authorized admins can also view connection status under Settings → Connections.

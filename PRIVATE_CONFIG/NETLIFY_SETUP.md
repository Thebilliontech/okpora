# Deploy Okpora to Netlify

## Important: deploy the whole project

**Netlify's basic drag-and-drop upload of `dist/` publishes static files only. It does not deploy this store's backend functions.** The full store must use a Git-connected build or Netlify CLI. The ZIP is a ready project folder, not a claim that static upload alone creates your database and payment accounts.

## Option A — GitHub import (recommended)

1. Download and extract `Okpora-Netlify-Project.zip`.
2. Open its `okpora` folder. You should see `package.json`, `netlify.toml`, `src`, `server`, `netlify`, and `PRIVATE_CONFIG`.
3. Create a private GitHub repository and upload the project contents. Include `server`, `netlify/functions`, `database`, `scripts`, `public`, `src`, `package-lock.json` and configuration files. Do not upload your real `.env`, `.local-db`, `node_modules`, `.netlify` or any secret file. Hidden `.gitignore` must be included when using Git.
4. In Netlify, choose **Add new project / Import an existing project** and connect that repository.
5. Set the base directory to blank if `package.json` is at the repository root. If you uploaded the containing `okpora` folder, set base directory to `okpora`.
6. Netlify reads `netlify.toml`:

   | Setting | Value |
   | --- | --- |
   | Build command | `npm run build` |
   | Publish directory | `dist` |
   | Functions directory | `netlify/functions` |
   | Node version | `22` |

7. Add the required environment variables listed in README.md. Server keys need Functions scope, public Vite settings need Builds scope. Use test credentials initially. Match SITE_URL to this project's actual HTTPS URL.
8. Deploy. Open the deploy log and confirm a successful build and six functions: `api`, `paystack-webhook`, `flutterwave-webhook`, `stripe-webhook`, `maintenance`, `sitemap`.
9. Run the database migration using DATABASE_SETUP.md. A frontend deploy does **not** run destructive or privileged migrations automatically.
10. Configure email, create the first administrator, add real products, set delivery rules and publish your business policies.
11. Configure the selected gateway's webhook and test the end-to-end flow.

## Option B — deploy the folder from your computer

Install Node 22 LTS or later. Open a terminal inside the extracted `okpora` folder:

```sh
npm ci
npx netlify-cli login
npx netlify-cli init
```

Use Netlify's browser sign-in. Select or create your project; Git is optional for a manual CLI deploy. Add environment variables in the Netlify dashboard, then:

```sh
npm run deploy
```

This calls `netlify deploy --build --prod`, using the publish/functions directories in `netlify.toml`. It installs/bundles dependencies for functions as part of deployment. `npm run build` can also be run locally before deployment.

If you want to test a draft first, run `npx netlify-cli deploy --build` without `--prod`. Use a separate test database and gateway test keys for staging. Set SITE_URL to the exact staging origin if you test CSRF-protected mutations on it; do not open production secrets to all preview deploys. Scheduled functions execute on production deploys, so draft email/refund checks need the local worker or a production test site.

## Updating secrets

Open Project configuration → Environment variables, change values, and trigger a new deployment. A fresh deployment is required to pick up function/build configuration changes. Do not place secrets in `netlify.toml` or in uploaded public assets.

## Custom domain and HTTPS

Add your owned domain under Domain management. Follow Netlify's exact DNS records shown for that project. Wait for DNS and the HTTPS certificate to finish provisioning. Choose one canonical hostname and redirect the other. Update SITE_URL, optional VITE_SITE_URL, payment webhook URLs and any payment dashboard callback restrictions to the canonical HTTPS origin, then redeploy and retest. SITE_URL must not include a path or trailing slash.

## Routing

API calls map from `/api/*` to the API function. `/sitemap.xml` maps to the sitemap function. All remaining non-file paths rewrite to `index.html`, so direct visits and refreshes at product, checkout, account and order URLs resolve through React Router. Product metadata is rendered in the browser; see DEPLOYMENT_STATUS.md for SEO limits.

## Verify before sharing

- Refresh `/products/your-product-slug`, `/account/orders` and `/checkout` directly.
- Confirm `/admin` cannot be used by a customer and admin APIs return 401/403 without the right role.
- Confirm functions do not return secret values or raw errors.
- Check the one-minute maintenance schedule and email outbox.
- Complete the launch checklist and browser checks on desktop and mobile.

Official deployment reference: [Netlify CLI — manual deploys and functions](https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/#manual-deploys).

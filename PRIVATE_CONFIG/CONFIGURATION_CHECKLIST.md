# Production launch checklist

## Connections

- [ ] Database created, backups enabled, DATABASE_URL set, remote TLS verified.
- [ ] Migration completed; okpora schema not exposed through a public database API.
- [ ] SITE_URL matches the canonical HTTPS store origin.
- [ ] Selected payment credentials and exact webhook URL/secret configured.
- [ ] Resend domain verified; RESEND_API_KEY and EMAIL_FROM configured.
- [ ] Optional ADMIN_NOTIFICATION_EMAIL set and tested.
- [ ] Optional public product-image bucket configured.
- [ ] Redeployed after environment changes.
- [ ] All six Netlify functions and one-minute maintenance schedule present.

## Store and administration

- [ ] First account registered, email verified, securely promoted and tested.
- [ ] Business name, logo, contact details, social links, hero and About page reviewed.
- [ ] Currency selected before first order; prices and tax settings verified.
- [ ] Real products, SKUs, images, variants, categories and stock entered.
- [ ] Sample drafts removed or replaced before publication.
- [ ] Delivery zones, fees, free thresholds and business-day estimates tested.
- [ ] Privacy, terms, shipping, returns, refunds and cookie policies supplied and reviewed.
- [ ] Product, inventory, category, coupon and content edits persist.
- [ ] Order search/filter/sort/export and CSV formula protection checked.
- [ ] Customer records, verified transactions and audit logs checked.

## Customer flow

- [ ] Desktop, iPhone and Android checked at 320, 390, 768 and 1440 px with no unintended horizontal scroll.
- [ ] Keyboard navigation, labels, focus, errors, loaders and 200% zoom checked.
- [ ] Search by name/category/SKU, filters, sorting and pagination tested.
- [ ] Gallery, variants, quantity limits, cart and wishlist tested.
- [ ] Guest bag survives refresh and merges on login; account bags remain isolated.
- [ ] Registration, verification, login, logout, remember-me and password reset tested.
- [ ] Saved addresses, profile, payment history and order tracking tested.
- [ ] Reviewed totals match gateway amounts.
- [ ] Percentage, fixed and free-shipping coupon rules tested, including limits/expiry.
- [ ] Unsupported delivery areas and out-of-stock orders blocked.

## Money and operations

- [ ] Provider test success, decline, cancellation and delayed callback tested.
- [ ] Wrong amount/currency rejected; duplicate callbacks do not duplicate stock reduction.
- [ ] Concurrent managed-PostgreSQL checkouts tested against a one-unit stock item.
- [ ] Reservation expiry and late-payment attention flow tested.
- [ ] Customer receipt, admin alert, status emails and retries confirmed.
- [ ] Shipment courier/tracking updates visible to customer.
- [ ] Review requires a delivered paid purchase and admin moderation.
- [ ] Customers cannot use admin APIs or read another customer's order.
- [ ] Cancellation restocks an unshipped order once; refunds handled separately.
- [ ] Full refund verified with gateway; ambiguous responses reconciled by refund ID.
- [ ] Email backlog, cron errors and provider limits monitored.
- [ ] Security headers, CSRF, rate limits and session expiry checked on Netlify.
- [ ] Analytics consent and verified Purchase event checked in configured platforms.
- [ ] Sitemap, robots.txt, titles and product structured data checked.
- [ ] Custom-domain DNS/HTTPS completed; deep links refresh correctly.
- [ ] Database restore and business data-retention procedures established.
- [ ] Low-value live payment/refund completed after switching to live keys.

Record the test date, domain, payment mode and result before opening the store.

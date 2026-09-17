# Email setup

Resend is the implemented transactional email provider. SendGrid, SMTP, Mailgun and SES require another adapter; they are not silently simulated.

1. Create your own Resend account.
2. Add a domain you own and complete Resend's DNS verification instructions.
3. Create a sending API key.
4. Set these Netlify environment variables:

   ```dotenv
   RESEND_API_KEY=YOUR_RESEND_API_KEY
   EMAIL_FROM=Okpora <orders@your-domain.com>
   ADMIN_NOTIFICATION_EMAIL=your-private-business-email@example.com
   ```

5. Redeploy. Ensure the scheduled `maintenance` function is present on the published production deploy.
6. Register and verify a test customer account, test password recovery, pay for a test order, and update its shipping status.
7. Confirm customer receipts, status emails and optional administrator alerts arrive. Check spam folders and sender-domain authentication.

Email messages are stored in `email_outbox` as part of the same transaction as the relevant event. The worker runs every minute on production Netlify deployments, sends within a bounded runtime and retries failed messages with backoff. Typical delivery starts within a minute; provider latency, rate limits and backlogs can delay it. Local `npm run dev` runs the worker every 30 seconds. Netlify draft deploys do not provide a production cron schedule.

Administrators can see queued mail and retry messages under Settings → Connections. Messages stop automatic attempts after ten failures; resolve the provider configuration before retrying. Stable email IDs are sent as Resend idempotency keys. Provider idempotency retention is finite, so this is at-least-once delivery with duplicate mitigation rather than a promise of exactly-once email.

Admin in-app paid-order notifications are created immediately in the payment transaction, independent of email delivery. The notifications screen refreshes every 15 seconds. Dashboard metrics refresh every 30 seconds.

Only the email service receives the necessary recipient/order details. API keys and password hashes never appear in email. Auth email URLs carry single-use, expiring tokens. Apply your own data-retention policy to old outbox records and expired tokens.

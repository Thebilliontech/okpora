# Payment setup

Three provider adapters are implemented. Activate one provider for **new** orders through `PAYMENT_PROVIDER`. Existing orders retain their original provider, so keep old provider credentials available until those orders and refunds are settled.

Hosted checkout handles all card details. Okpora never requests or stores PANs, CVVs, PINs or banking OTPs.

## Paystack — default

Set:

```dotenv
PAYMENT_PROVIDER=paystack
PAYSTACK_SECRET_KEY=YOUR_PAYSTACK_SECRET_KEY
```

In the Paystack dashboard, set the webhook URL:

`https://YOUR-SITE/.netlify/functions/paystack-webhook`

Use test credentials first. The adapter initializes a transaction from the server, redirects to Paystack, verifies through the transaction verification endpoint, and validates the raw-body HMAC-SHA512 signature on webhooks. Your callback URL is generated from SITE_URL automatically.

## Flutterwave v3

Set:

```dotenv
PAYMENT_PROVIDER=flutterwave
FLUTTERWAVE_SECRET_KEY=YOUR_FLUTTERWAVE_SECRET_KEY
FLUTTERWAVE_WEBHOOK_SECRET=YOUR_RANDOM_WEBHOOK_SECRET
FLUTTERWAVE_WEBHOOK_MODE=legacy
```

Use the **same webhook secret** in your Flutterwave dashboard. Webhook URL:

`https://YOUR-SITE/.netlify/functions/flutterwave-webhook`

The included payment adapter uses Flutterwave v3 hosted Standard checkout and verifies by transaction reference. The v3 webhook documentation uses a constant-time comparison of `verif-hash` against your configured secret; `legacy` selects that contract explicitly. If your account's webhook contract uses HMAC-SHA256/base64 in `flutterwave-signature`, choose `hmac` instead and test it with your account. There is no automatic insecure fallback between modes. Enable webhook retries in Flutterwave.

## Stripe

Set:

```dotenv
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=YOUR_STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET=YOUR_ENDPOINT_SIGNING_SECRET
```

Webhook URL:

`https://YOUR-SITE/.netlify/functions/stripe-webhook`

Subscribe to `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Use the signing secret for this exact endpoint and environment. Stripe Checkout runs in hosted payment mode. An unpaid completed session cannot fulfil an order; the backend re-fetches the session and requires `payment_status=paid`.

Use a provider account eligible for your business's actual country and settlement currency. This package does not create or approve merchant accounts.

## What is verified

Status, provider, order metadata when returned, unique reference, currency, exact minor-unit amount, and unique provider transaction ID. Database transactions and row locks prevent duplicate fulfilment. Payment records and email/admin notifications are persisted atomically with settlement. The browser never gets to mark an order paid.

The reviewed total must still match at payment initialization. Price/delivery/tax changes send the customer back to review.

## Stock and expired payments

Checkout holds stock for 30 minutes. The maintenance function releases expired reservations and rechecks unsettled payments for seven days. If a late payment arrives after stock has been taken by another order, the payment is recorded, fulfilment is blocked, and the admin/customer receive an attention message. Handle fulfilment or issue a refund; never ignore that alert.

## Refunds

A super administrator can request a **full refund** from an order's payment panel. A database request record prevents double submission. Final refunded status comes from provider verification by the maintenance worker, not the request button. If the gateway response is lost, the order stays `refund_pending` / `needs_reconciliation`: look up the refund in the gateway dashboard and enter its refund ID in the order editor. Do not blindly request a second refund.

Partial refunds and dispute handling are not implemented in this release. Process them in the payment dashboard and extend the reconciliation model before relying on them in-app. Returned merchandise is not automatically restocked by refunding; inspect it and adjust inventory explicitly. Cancelling an unshipped order and refunding payment are separate actions.

## Go live

Complete every payment item in CONFIGURATION_CHECKLIST.md. Test success, decline, cancellation, an amount mismatch, a duplicate webhook, a delayed webhook, stock exhaustion, a late payment and refund reconciliation. Replace test keys with live keys only after the account is approved. Redeploy. Run a low-value live payment and refund using your own approved test procedure.

Official references checked for this implementation:

- [Paystack transaction API](https://paystack.com/docs/api/transaction/)
- [Paystack webhooks](https://paystack.com/docs/payments/webhooks/)
- [Flutterwave webhooks](https://developer.flutterwave.com/docs/webhooks)
- [Stripe Checkout fulfilment](https://docs.stripe.com/checkout/fulfillment)

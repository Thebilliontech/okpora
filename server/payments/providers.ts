import Stripe from 'stripe';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config/index';
import { fail } from '../http';
export type Verified = {
  provider: string;
  reference: string;
  transaction: string;
  status: string;
  amount: number;
  currency: string;
  orderId?: string;
};
const stripe = () => new Stripe(config.stripeSecret, { timeout: 8000, maxNetworkRetries: 0 });
async function call(provider: string, path: string, body?: unknown) {
  const paystack = provider === 'paystack';
  const secret = paystack ? config.paystackSecret : config.flutterwaveSecret;
  if (!secret) fail(503, 'Payments are temporarily unavailable.');
  const response = await fetch(
    (paystack ? 'https://api.paystack.co' : 'https://api.flutterwave.com/v3') + path,
    {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(8000),
    },
  );
  const result = await response.json();
  if (!response.ok || result.status === false || result.status === 'error')
    fail(502, 'The payment provider could not complete this request. Please try again.');
  return result.data;
}
export async function initialize(order: any, email: string) {
  const callback = `${config.siteUrl}/payment/return?order=${order.id}`;
  if (order.provider === 'paystack') {
    const data = await call('paystack', '/transaction/initialize', {
      reference: order.payment_reference,
      email,
      amount: order.total,
      currency: order.currency,
      callback_url: callback,
      metadata: { order_id: order.id },
    });
    return { url: data.authorization_url, session: order.payment_reference };
  }
  if (order.provider === 'flutterwave') {
    const data = await call('flutterwave', '/payments', {
      tx_ref: order.payment_reference,
      amount: order.total / 100,
      currency: order.currency,
      redirect_url: callback,
      customer: { email, name: order.address.full_name, phonenumber: order.address.phone },
      meta: { order_id: order.id },
      customizations: { title: 'Okpora order ' + order.number },
    });
    return { url: data.link, session: order.payment_reference };
  }
  if (order.provider === 'stripe') {
    const s = await stripe().checkout.sessions.create(
      {
        mode: 'payment',
        client_reference_id: order.payment_reference,
        customer_email: email,
        metadata: { order_id: order.id },
        payment_intent_data: { metadata: { order_id: order.id } },
        line_items: [
          {
            price_data: {
              currency: order.currency.toLowerCase(),
              unit_amount: order.total,
              product_data: { name: 'Okpora order ' + order.number },
            },
            quantity: 1,
          },
        ],
        success_url: callback + '&session_id={CHECKOUT_SESSION_ID}',
        cancel_url: `${config.siteUrl}/payment/cancelled?order=${order.id}`,
        expires_at: Math.floor(Date.now() / 1000) + 1800,
      },
      { idempotencyKey: order.id },
    );
    return { url: s.url!, session: s.id };
  }
  return fail(503, 'No payment provider is available.');
}
export async function verify(provider: string, reference: string, session?: string): Promise<Verified> {
  if (provider === 'paystack') {
    const d = await call(provider, '/transaction/verify/' + encodeURIComponent(reference));
    return {
      provider,
      reference: d.reference,
      transaction: String(d.id),
      status: d.status,
      amount: Number(d.amount),
      currency: d.currency,
      orderId: d.metadata?.order_id,
    };
  }
  if (provider === 'flutterwave') {
    const d = await call(
      provider,
      '/transactions/verify_by_reference?tx_ref=' + encodeURIComponent(reference),
    );
    return {
      provider,
      reference: d.tx_ref,
      transaction: String(d.id),
      status: d.status === 'successful' ? 'success' : d.status,
      amount: Math.round(Number(d.amount) * 100),
      currency: d.currency,
      orderId: d.meta?.order_id,
    };
  }
  if (!session) fail(400, 'Payment session is not ready.');
  const d = await stripe().checkout.sessions.retrieve(session!);
  return {
    provider,
    reference: d.client_reference_id || '',
    transaction: String(d.payment_intent || d.id),
    status: d.payment_status === 'paid' ? 'success' : d.status || 'pending',
    amount: d.amount_total || 0,
    currency: (d.currency || '').toUpperCase(),
    orderId: d.metadata?.order_id,
  };
}
export function constantEqual(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function checkSignature(provider: string, raw: string, headers: Headers): any {
  if (provider === 'stripe') {
    if (!config.stripeWebhook) fail(503, 'Webhook unavailable.');
    try {
      return stripe().webhooks.constructEvent(
        raw,
        headers.get('stripe-signature') || '',
        config.stripeWebhook,
      );
    } catch {
      fail(400, 'Invalid signature.');
    }
  }
  if (provider === 'paystack') {
    if (!config.paystackSecret) fail(503, 'Webhook unavailable.');
    const expected = createHmac('sha512', config.paystackSecret).update(raw).digest('hex');
    if (!constantEqual(expected, headers.get('x-paystack-signature') || '')) fail(401, 'Invalid signature.');
  } else if (provider === 'flutterwave') {
    if (!config.flutterwaveHash) fail(503, 'Webhook unavailable.');
    const signature =
      config.flutterwaveMode === 'legacy' ? headers.get('verif-hash') : headers.get('flutterwave-signature');
    const expected =
      config.flutterwaveMode === 'legacy'
        ? config.flutterwaveHash
        : createHmac('sha256', config.flutterwaveHash).update(raw).digest('base64');
    if (!constantEqual(expected, signature || '')) fail(401, 'Invalid signature.');
  } else fail(404, 'Provider not found.');
  try {
    return JSON.parse(raw);
  } catch {
    fail(400, 'Invalid webhook.');
  }
}
export async function requestRefund(order: any, payment: any) {
  if (order.provider === 'paystack') {
    const d = await call('paystack', '/refund', {
      transaction: payment.provider_transaction,
      amount: order.total,
    });
    return { id: String(d.id), status: d.status };
  }
  if (order.provider === 'flutterwave') {
    const d = await call(
      'flutterwave',
      `/transactions/${encodeURIComponent(payment.provider_transaction)}/refund`,
      { amount: order.total / 100 },
    );
    return { id: String(d.id), status: d.status };
  }
  const d = await stripe().refunds.create(
    { payment_intent: payment.provider_transaction, amount: order.total },
    { idempotencyKey: 'refund-' + order.id },
  );
  return { id: d.id, status: d.status };
}
export type ExpectedRefund = { transaction: string; amount: number; currency: string };
export function validateRefund(provider: string, data: any, expected: ExpectedRefund) {
  const transaction =
    provider === 'stripe'
      ? String(typeof data.payment_intent === 'object' ? data.payment_intent?.id : data.payment_intent)
      : provider === 'flutterwave'
        ? String(data.transaction_id)
        : String(typeof data.transaction === 'object' ? data.transaction?.id : data.transaction);
  const amount = provider === 'flutterwave' ? Math.round(Number(data.amount) * 100) : Number(data.amount);
  if (
    transaction !== expected.transaction ||
    amount !== expected.amount ||
    (data.currency && String(data.currency).toUpperCase() !== expected.currency)
  )
    fail(400, 'Refund details do not match the original payment.');
}
export async function verifyRefund(provider: string, id: string, expected: ExpectedRefund) {
  const d =
    provider === 'stripe'
      ? await stripe().refunds.retrieve(id)
      : await call(
          provider,
          (provider === 'flutterwave' ? '/refunds/' : '/refund/') + encodeURIComponent(id),
        );
  validateRefund(provider, d, expected);
  return ['succeeded', 'processed', 'completed', 'successful'].includes(d.status || '')
    ? 'refunded'
    : ['failed', 'cancelled'].includes(d.status || '')
      ? 'failed'
      : 'pending';
}

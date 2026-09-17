import { checkSignature, verify } from './providers';
import { query } from '../db';
import { settlePayment } from '../orders/service';
import { json, HttpError } from '../http';
export async function webhook(req: Request, provider: string) {
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const raw = await req.text();
    if (raw.length > 1000000) return json({ error: 'Payload too large' }, 413);
    const event = checkSignature(provider, raw, req.headers);
    let reference: string | undefined, session: string | undefined;
    if (provider === 'paystack' && event.event === 'charge.success') reference = event.data.reference;
    if (
      provider === 'flutterwave' &&
      (event.event === 'charge.completed' || event.type === 'charge.completed')
    )
      reference = event.data.tx_ref || event.data.reference;
    if (
      provider === 'stripe' &&
      ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)
    ) {
      reference = event.data.object.client_reference_id;
      session = event.data.object.id;
    }
    if (!reference) return json({ received: true });
    const eventId = String(event.id || event.data.id) + '-' + String(event.event || event.type);
    if (
      (await query('SELECT 1 FROM webhook_events WHERE provider=$1 AND event_id=$2', [provider, eventId]))
        .rows.length
    )
      return json({ received: true });
    const o = (
      await query('SELECT provider,provider_session FROM orders WHERE payment_reference=$1', [reference])
    ).rows[0];
    if (!o) return json({ received: true });
    if (o.provider !== provider) return json({ error: 'Provider mismatch' }, 400);
    await settlePayment(await verify(provider, reference, session || o.provider_session));
    await query('INSERT INTO webhook_events(provider,event_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [
      provider,
      eventId,
    ]);
    return json({ received: true });
  } catch (e: any) {
    if (e instanceof HttpError)
      return json(
        { error: e.status >= 500 ? 'Payment service unavailable' : e.message },
        e.status === 409 ? 503 : e.status,
      );
    console.error('Webhook failed', { provider, code: e.code || e.name });
    return json({ error: 'Webhook processing failed' }, 500);
  }
}

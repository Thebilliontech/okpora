import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { query, tx, type DB } from '../db';
import { config, missingConfig } from '../config/index';
import { fail, uuid, email } from '../http';
import { hash, type User } from '../auth/security';
import { queueEmail } from '../email/index';
import * as gateway from '../payments/providers';
export const addressSchema = z.object({
  full_name: z.string().trim().min(2).max(150),
  email,
  phone: z.string().trim().min(7).max(30),
  country: z.string().trim().min(2).max(80),
  region: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(100),
  address: z.string().trim().min(5).max(500),
  instructions: z.string().max(1000).default(''),
});
export const checkoutSchema = z.object({
  items: z
    .array(z.object({ variant_id: uuid, quantity: z.number().int().min(1).max(99) }))
    .min(1)
    .max(100),
  address: addressSchema,
  coupon: z.string().trim().max(50).default(''),
  checkout_key: uuid,
  reviewed_total: z.number().int().positive().optional(),
  reviewed_currency: z.string().length(3).optional(),
});
export type Checkout = z.infer<typeof checkoutSchema>;
export async function storeSettings(db: DB = { query }) {
  return (await db.query("SELECT value FROM site_settings WHERE key='store'")).rows[0].value;
}
export async function calculate(db: DB, input: Checkout, lock = false) {
  const ids = input.items.map((i) => i.variant_id);
  if (new Set(ids).size !== ids.length) fail(400, 'Combine duplicate cart items.');
  if (lock)
    await db.query(
      'SELECT variant_id FROM inventory WHERE variant_id=ANY($1::uuid[]) ORDER BY variant_id FOR UPDATE',
      [ids],
    );
  const { rows } = await db.query(
    `SELECT v.id AS variant_id,v.product_id,v.name AS variant,v.sku,COALESCE(v.price,p.price) AS price,p.name,p.image,p.visible,v.active,i.quantity,
 COALESCE((SELECT sum(oi.quantity) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.variant_id=v.id AND o.stock_state='reserved' AND o.reserved_until>now()),0)::int AS reserved,
 ARRAY(SELECT category_id FROM product_categories WHERE product_id=p.id) AS category_ids FROM product_variants v JOIN products p ON p.id=v.product_id JOIN inventory i ON i.variant_id=v.id WHERE v.id=ANY($1::uuid[])`,
    [ids],
  );
  const items = input.items.map((item) => {
    const p = rows.find((r) => r.variant_id === item.variant_id);
    if (!p || !p.visible || !p.active) fail(400, 'An item is no longer available.');
    if (p.quantity - p.reserved < item.quantity)
      fail(409, `${p.name}: only ${Math.max(0, p.quantity - p.reserved)} available.`);
    return { ...p, quantity: item.quantity };
  });
  const settings = await storeSettings(db);
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  if (!Number.isSafeInteger(subtotal) || subtotal > 100000000)
    fail(400, 'Please contact us for this order size.');
  const zones = await db.query(
    `SELECT * FROM delivery_zones WHERE active AND lower(country)=lower($1) AND (region='' OR lower(region)=lower($2)) AND (city='' OR lower(city)=lower($3)) ORDER BY (CASE WHEN city<>'' THEN 2 ELSE 0 END + CASE WHEN region<>'' THEN 1 ELSE 0 END) DESC,fee ASC LIMIT 1`,
    [input.address.country, input.address.region, input.address.city],
  );
  const zone = zones.rows[0];
  if (!zone) fail(400, 'Delivery is not available for this address yet. Please contact us.');
  let delivery_fee = zone.free_threshold !== null && subtotal >= zone.free_threshold ? 0 : zone.fee;
  let discount = 0;
  let coupon: any = null;
  if (input.coupon) {
    coupon = (
      await db.query(
        `SELECT * FROM coupons WHERE code=$1 AND active AND (starts_at IS NULL OR starts_at<=now()) AND (expires_at IS NULL OR expires_at>now())${lock ? ' FOR UPDATE' : ''}`,
        [input.coupon.toUpperCase()],
      )
    ).rows[0];
    if (!coupon) fail(400, 'This coupon is not available.');
    if (subtotal < coupon.minimum) fail(400, 'The order does not meet the coupon minimum.');
    const used = Number(
      (
        await db.query(
          `SELECT count(*) AS count FROM orders WHERE coupon_id=$1 AND (stock_state='committed' OR (stock_state='reserved' AND reserved_until>now()))`,
          [coupon.id],
        )
      ).rows[0].count,
    );
    if (coupon.usage_limit && used >= coupon.usage_limit)
      fail(400, 'This coupon has reached its usage limit.');
    const eligible = items
      .filter(
        (i) =>
          (!coupon.product_ids.length && !coupon.category_ids.length) ||
          coupon.product_ids.includes(i.product_id) ||
          i.category_ids.some((c: string) => coupon.category_ids.includes(c)),
      )
      .reduce((s, i) => s + i.price * i.quantity, 0);
    if (!eligible) fail(400, 'This coupon does not apply to the items in your bag.');
    if (coupon.kind === 'free_shipping') delivery_fee = 0;
    else
      discount = Math.min(
        eligible,
        coupon.kind === 'percentage' ? Math.floor((eligible * coupon.value) / 100) : coupon.value,
        coupon.maximum ?? Number.MAX_SAFE_INTEGER,
      );
  }
  const tax = Math.round(((subtotal - discount) * Number(settings.tax_percent || 0)) / 100),
    total = subtotal - discount + delivery_fee + tax;
  if (total < 100) fail(400, 'Order total must be at least one currency unit.');
  return {
    items,
    subtotal,
    discount,
    delivery_fee,
    tax,
    total,
    currency: settings.currency,
    min_days: zone.min_days,
    max_days: zone.max_days,
    coupon_id: coupon?.id || null,
  };
}
export async function createCheckout(input: Checkout, user: User) {
  if (missingConfig('all').length) fail(503, 'Checkout is being configured. Please try again later.');
  const fingerprint = hash(JSON.stringify({ ...input, checkout_key: undefined }));
  const order = await tx(async (db) => {
    await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
    const existing = (
      await db.query('SELECT * FROM orders WHERE user_id=$1 AND checkout_key=$2', [
        user.id,
        input.checkout_key,
      ])
    ).rows[0];
    if (existing) {
      if (existing.request_hash !== fingerprint)
        fail(409, 'Checkout details changed. Please start a new checkout.');
      if (existing.stock_state === 'released' || new Date(existing.reserved_until).getTime() < Date.now())
        fail(409, 'This checkout expired. Please start again.');
      return existing;
    }
    const quote = await calculate(db, input, true);
    if (
      input.reviewed_total !== undefined &&
      (input.reviewed_total !== quote.total || input.reviewed_currency !== quote.currency)
    )
      fail(409, 'Your order total changed. Review the updated price before paying.');
    const reference = 'OKP-' + randomUUID();
    const { rows } = await db.query(
      `INSERT INTO orders(user_id,checkout_key,request_hash,subtotal,discount,delivery_fee,tax,total,currency,provider,payment_reference,address,min_days,max_days,coupon_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        user.id,
        input.checkout_key,
        fingerprint,
        quote.subtotal,
        quote.discount,
        quote.delivery_fee,
        quote.tax,
        quote.total,
        quote.currency,
        config.provider,
        reference,
        input.address,
        quote.min_days,
        quote.max_days,
        quote.coupon_id,
      ],
    );
    const o = rows[0];
    for (const item of quote.items)
      await db.query(
        `INSERT INTO order_items(order_id,product_id,variant_id,name,variant,sku,image,price,quantity) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          o.id,
          item.product_id,
          item.variant_id,
          item.name,
          item.variant,
          item.sku,
          item.image,
          item.price,
          item.quantity,
        ],
      );
    await db.query(`INSERT INTO order_status_history(order_id,status) VALUES($1,'pending_payment')`, [o.id]);
    await db.query(
      `INSERT INTO transactions(order_id,kind,reference,provider,amount,currency,status) VALUES($1,'payment',$2,$3,$4,$5,'pending')`,
      [o.id, o.payment_reference, o.provider, o.total, o.currency],
    );
    return o;
  });
  if (order.checkout_url) return { id: order.id, url: order.checkout_url };
  const initialized = await gateway.initialize(order, user.email);
  if (!/^https:\/\//.test(initialized.url)) fail(502, 'Invalid payment redirect.');
  await query('UPDATE orders SET provider_session=$2,checkout_url=$3 WHERE id=$1', [
    order.id,
    initialized.session,
    initialized.url,
  ]);
  return { id: order.id, url: initialized.url };
}
export function validatePayment(order: any, payment: gateway.Verified) {
  if (payment.status !== 'success') fail(409, 'Payment has not been confirmed yet.');
  if (
    payment.provider !== order.provider ||
    payment.reference !== order.payment_reference ||
    payment.currency !== order.currency ||
    payment.amount !== order.total ||
    (payment.orderId && payment.orderId !== order.id)
  )
    fail(400, 'Payment details do not match this order.');
  if (!payment.transaction || payment.transaction === 'undefined') fail(400, 'Invalid payment transaction.');
}
export async function settlePayment(payment: gateway.Verified) {
  return tx(async (db) => {
    const order = (
      await db.query('SELECT * FROM orders WHERE payment_reference=$1 FOR UPDATE', [payment.reference])
    ).rows[0];
    if (!order) fail(404, 'Order not found.');
    validatePayment(order, payment);
    if (['paid', 'refund_pending', 'refunded'].includes(order.payment_status)) return order;
    const items = (
      await db.query('SELECT * FROM order_items WHERE order_id=$1 ORDER BY variant_id', [order.id])
    ).rows;
    await db.query(
      'SELECT variant_id FROM inventory WHERE variant_id=ANY($1::uuid[]) ORDER BY variant_id FOR UPDATE',
      [items.map((i) => i.variant_id)],
    );
    let canFulfil = order.status !== 'cancelled';
    for (const item of items) {
      const stock = (
        await db.query(
          `SELECT quantity-COALESCE((SELECT sum(oi.quantity) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.variant_id=$1 AND o.id<>$2 AND o.stock_state='reserved' AND o.reserved_until>now()),0)::int AS available FROM inventory WHERE variant_id=$1`,
          [item.variant_id, order.id],
        )
      ).rows[0];
      if (stock.available < item.quantity) canFulfil = false;
    }
    await db.query(
      'INSERT INTO payments(order_id,provider,provider_transaction,reference,amount,currency) VALUES($1,$2,$3,$4,$5,$6)',
      [order.id, payment.provider, payment.transaction, payment.reference, payment.amount, payment.currency],
    );
    await db.query(
      `UPDATE transactions SET reference=$2,status='successful' WHERE order_id=$1 AND kind='payment'`,
      [order.id, payment.transaction],
    );
    if (canFulfil)
      for (const item of items)
        await db.query('UPDATE inventory SET quantity=quantity-$2 WHERE variant_id=$1', [
          item.variant_id,
          item.quantity,
        ]);
    const next = canFulfil ? 'paid' : 'cancelled';
    await db.query(
      `UPDATE orders SET payment_status='paid',status=$2,stock_state=$3,paid_at=now(),updated_at=now() WHERE id=$1`,
      [order.id, next, canFulfil ? 'committed' : 'released'],
    );
    if (order.coupon_id)
      await db.query(
        'INSERT INTO coupon_usage(coupon_id,order_id,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [order.coupon_id, order.id, order.user_id],
      );
    await db.query('INSERT INTO order_status_history(order_id,status,note) VALUES($1,$2,$3)', [
      order.id,
      next,
      canFulfil
        ? 'Payment verified.'
        : 'Payment received after stock reservation expired or cancellation. Our team will contact you to arrange fulfilment or a refund.',
    ]);
    const title = canFulfil ? 'New paid order' : 'Payment requires attention';
    await db.query(`INSERT INTO notifications(audience,title,body,order_id) VALUES('admin',$1,$2,$3)`, [
      title,
      `${order.number} · ${order.currency} ${(order.total / 100).toFixed(2)}`,
      order.id,
    ]);
    await db.query(
      `INSERT INTO notifications(user_id,audience,title,body,order_id) VALUES($1,'customer','Payment confirmed',$2,$3)`,
      [
        order.user_id,
        canFulfil
          ? `Your order ${order.number} is confirmed.`
          : 'Payment received. Our team is reviewing availability and will contact you.',
        order.id,
      ],
    );
    const customer = (await db.query('SELECT email,name FROM users WHERE id=$1', [order.user_id])).rows[0];
    const summary = `Hi ${customer.name},\n\nPayment received for ${order.number}.\n${items.map((i) => `${i.name} (${i.variant}) × ${i.quantity}`).join('\n')}\n\nTotal: ${order.currency} ${(order.total / 100).toFixed(2)}\nDelivery: ${order.address.address}, ${order.address.city}, ${order.address.region}, ${order.address.country}\n${canFulfil ? `Estimated delivery: ${order.min_days}–${order.max_days} business days.` : 'Your reservation expired or the order was cancelled. Our team will contact you about fulfilment or a refund.'}\n\nView your order: ${config.siteUrl}/order/${order.number}`;
    await queueEmail(
      db,
      'paid-' + order.id,
      customer.email,
      'Okpora payment confirmation · ' + order.number,
      summary,
    );
    if (config.adminEmail)
      await queueEmail(
        db,
        'admin-paid-' + order.id,
        config.adminEmail,
        title + ' · ' + order.number,
        summary,
      );
    for (const item of items) {
      const stock = (await db.query('SELECT * FROM inventory WHERE variant_id=$1', [item.variant_id]))
        .rows[0];
      if (stock.quantity <= stock.low_stock_threshold)
        await db.query(`INSERT INTO notifications(audience,title,body) VALUES('admin',$1,$2)`, [
          stock.quantity === 0 ? 'Out of stock' : 'Low stock',
          `${item.name} (${item.variant}): ${stock.quantity} remaining`,
        ]);
    }
    return {
      ...order,
      payment_status: 'paid',
      status: next,
      stock_state: canFulfil ? 'committed' : 'released',
    };
  });
}
export async function verifyOrder(id: string, user?: User) {
  const order = (await query('SELECT * FROM orders WHERE id=$1', [id])).rows[0];
  if (!order || (user && order.user_id !== user.id && !['admin', 'super_admin'].includes(user.role)))
    fail(404, 'Order not found.');
  if (['paid', 'refund_pending', 'refunded'].includes(order.payment_status)) return order;
  return settlePayment(await gateway.verify(order.provider, order.payment_reference, order.provider_session));
}
export async function orderDetails(idOrNumber: string, user: User) {
  const o = (
    await query(`SELECT * FROM orders WHERE (id::text=$1 OR number=$1) AND (user_id=$2 OR $3)`, [
      idOrNumber,
      user.id,
      ['admin', 'super_admin'].includes(user.role),
    ])
  ).rows[0];
  if (!o) fail(404, 'Order not found.');
  const [items, history, shipment, notes] = await Promise.all([
    query('SELECT * FROM order_items WHERE order_id=$1', [o.id]),
    query('SELECT * FROM order_status_history WHERE order_id=$1 ORDER BY created_at', [o.id]),
    query('SELECT * FROM shipments WHERE order_id=$1', [o.id]),
    ['admin', 'super_admin'].includes(user.role)
      ? query('SELECT * FROM order_notes WHERE order_id=$1 ORDER BY created_at DESC', [o.id])
      : Promise.resolve({ rows: [] }),
  ]);
  return { ...o, items: items.rows, history: history.rows, shipment: shipment.rows[0], notes: notes.rows };
}
export const transitions: Record<string, string[]> = {
  paid: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery', 'delivered'],
  out_for_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
  pending_payment: ['cancelled'],
  refunded: [],
};
export async function updateOrder(id: string, input: any, user: User) {
  return tx(async (db) => {
    const o = (await db.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!o) fail(404, 'Order not found.');
    const status = input.status || o.status;
    if (status !== o.status && !transitions[o.status]?.includes(status))
      fail(400, 'This status change is not allowed.');
    if (status !== o.status && status !== 'cancelled' && o.payment_status !== 'paid')
      fail(400, 'This order is not paid.');
    if (status === 'cancelled' && o.stock_state !== 'released') {
      if (o.stock_state === 'committed') {
        const items = (
          await db.query('SELECT * FROM order_items WHERE order_id=$1 ORDER BY variant_id', [id])
        ).rows;
        for (const i of items)
          await db.query('UPDATE inventory SET quantity=quantity+$2 WHERE variant_id=$1', [
            i.variant_id,
            i.quantity,
          ]);
      }
      await db.query("UPDATE orders SET stock_state='released' WHERE id=$1", [id]);
    }
    await db.query('UPDATE orders SET status=$2,min_days=$3,max_days=$4,updated_at=now() WHERE id=$1', [
      id,
      status,
      input.min_days ?? o.min_days,
      input.max_days ?? o.max_days,
    ]);
    if (input.courier !== undefined)
      await db.query(
        `INSERT INTO shipments(order_id,courier,tracking_number,tracking_url) VALUES($1,$2,$3,$4) ON CONFLICT(order_id) DO UPDATE SET courier=$2,tracking_number=$3,tracking_url=$4`,
        [id, input.courier, input.tracking_number || '', input.tracking_url || ''],
      );
    if (input.admin_note)
      await db.query('INSERT INTO order_notes(order_id,admin_id,note) VALUES($1,$2,$3)', [
        id,
        user.id,
        input.admin_note,
      ]);
    if (status !== o.status) {
      await db.query('INSERT INTO order_status_history(order_id,status,actor_id) VALUES($1,$2,$3)', [
        id,
        status,
        user.id,
      ]);
      await db.query(
        `INSERT INTO notifications(user_id,audience,title,body,order_id) VALUES($1,'customer',$2,$3,$4)`,
        [o.user_id, 'Order updated', `${o.number}: ${status.replaceAll('_', ' ')}`, id],
      );
      const customer = (await db.query('SELECT email FROM users WHERE id=$1', [o.user_id])).rows[0];
      await queueEmail(
        db,
        `status-${id}-${status}`,
        customer.email,
        `Okpora ${o.number} · ${status.replaceAll('_', ' ')}`,
        `Your order is now ${status.replaceAll('_', ' ')}.\n${status === 'cancelled' && o.payment_status === 'paid' ? 'If a refund is due, it will be processed separately.\n' : ''}View updates: ${config.siteUrl}/order/${o.number}`,
      );
    }
    await db.query(
      'INSERT INTO audit_logs(admin_id,action,object_type,object_id,details) VALUES($1,$2,$3,$4,$5)',
      [user.id, 'Order updated', 'order', id, { previous: o.status, ...input }],
    );
    return { ok: true };
  });
}

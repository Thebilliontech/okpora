import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { localDatabase } from '../scripts/local-db';
import { migrate } from '../scripts/migrate';
import { seed } from '../scripts/seed';
import { query } from '../server/db';
import { config } from '../server/config/index';
import { handleRequest } from '../server/app';
import {
  createCheckout,
  settlePayment,
  validatePayment,
  updateOrder,
  calculate,
} from '../server/orders/service';
import { passwordHash, passwordMatches, hash, newSession, type User } from '../server/auth/security';
import { checkSignature, validateRefund } from '../server/payments/providers';
import { csv } from '../server/http';
import { createHmac, randomUUID } from 'node:crypto';
let database: any, user: User, admin: User, variant: any, product: any, cookie: string, csrf: string;
const originalFetch = globalThis.fetch;
const address = {
  full_name: 'Test Buyer',
  email: 'buyer@example.test',
  phone: '08000000000',
  country: 'Nigeria',
  region: 'Rivers',
  city: 'Port Harcourt',
  address: '1 Test Address',
  instructions: '',
};
const input = (quantity = 1) => ({
  items: [{ variant_id: variant.id, quantity }],
  address,
  coupon: '',
  checkout_key: randomUUID(),
});
const request = (path: string, method = 'GET', body?: any, auth = true, extra: Record<string, string> = {}) =>
  handleRequest(
    new Request('http://localhost:5173/api' + path, {
      method,
      headers: {
        Origin: 'http://localhost:5173',
        'Content-Type': 'application/json',
        ...(auth ? { Cookie: cookie, 'X-CSRF-Token': csrf } : {}),
        ...extra,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
before(async () => {
  database = await localDatabase();
  await migrate();
  await seed(true);
  config.paystackSecret = 'test-secret';
  config.databaseUrl = 'postgresql://local-test';
  config.resendKey = 'test-key';
  config.emailFrom = 'test@example.test';
  const pass = await passwordHash('A-secure-test-password');
  user = (
    await query(
      "INSERT INTO users(name,email,password_hash,email_verified) VALUES('Test Buyer','buyer@example.test',$1,true) RETURNING *",
      [pass],
    )
  ).rows[0];
  admin = (
    await query(
      "INSERT INTO users(name,email,password_hash,email_verified,role) VALUES('Store Owner','owner@example.test',$1,true,'super_admin') RETURNING *",
      [pass],
    )
  ).rows[0];
  const session = await newSession({ query }, user.id, false);
  cookie = session.cookie.split(';')[0];
  csrf = session.csrf;
  user.csrf_token = csrf;
  product = (await query('SELECT * FROM products ORDER BY name LIMIT 1')).rows[0];
  variant = (await query('SELECT * FROM product_variants WHERE product_id=$1', [product.id])).rows[0];
  await query(
    "INSERT INTO delivery_zones(name,country,region,fee,min_days,max_days) VALUES('Test zone','Nigeria','Rivers',200000,3,5)",
  );
  globalThis.fetch = (async (url: any, options: any) => {
    const text = String(url);
    if (text.includes('transaction/initialize')) {
      const b = JSON.parse(options.body);
      return new Response(
        JSON.stringify({
          status: true,
          data: { authorization_url: 'https://checkout.paystack.com/test-' + b.reference },
        }),
        { status: 200 },
      );
    }
    throw new Error('Unexpected network call in isolated test: ' + text);
  }) as typeof fetch;
});
after(async () => {
  globalThis.fetch = originalFetch;
  await database.close();
});
test('schema migration is idempotent', async () => {
  await migrate();
  assert.equal((await query('SELECT * FROM schema_migrations')).rows.length, 1);
});
test('scrypt password hashes are salted and verified', async () => {
  const a = await passwordHash('correct horse battery staple'),
    b = await passwordHash('correct horse battery staple');
  assert.notEqual(a, b);
  assert.ok(await passwordMatches('correct horse battery staple', a));
  assert.equal(await passwordMatches('wrong', a), false);
});
test('public product search includes SKU and categories', async () => {
  const r = await request('/products?q=' + encodeURIComponent(product.sku), 'GET', undefined, false);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).items[0].id, product.id);
});
test('anonymous customers cannot access admin API', async () => {
  assert.equal((await request('/admin/orders', 'GET', undefined, false)).status, 401);
});
test('ordinary customers cannot access admin API', async () => {
  assert.equal((await request('/admin/orders')).status, 403);
});
test('cross-origin mutations fail closed', async () => {
  assert.equal(
    (
      await request('/profile', 'PATCH', { name: 'Hacked', phone: '' }, true, {
        Origin: 'https://attacker.invalid',
      })
    ).status,
    403,
  );
});
test('missing CSRF token blocks signed-in mutations', async () => {
  assert.equal(
    (await request('/profile', 'PATCH', { name: 'Updated', phone: '' }, true, { 'X-CSRF-Token': '' })).status,
    403,
  );
});
test('invalid cart quantities are rejected', async () => {
  assert.equal(
    (await request('/cart', 'PUT', { items: [{ variant_id: variant.id, quantity: -1 }] })).status,
    400,
  );
});
test('account cart persists using real database', async () => {
  assert.equal(
    (await request('/cart', 'PUT', { items: [{ variant_id: variant.id, quantity: 2 }] })).status,
    200,
  );
  const rows = await (await request('/cart')).json();
  assert.equal(rows[0].quantity, 2);
});
test('quote ignores client-submitted prices', async () => {
  const data = { ...input(), price: 1, total: 1 };
  const r = await request('/checkout/quote', 'POST', data);
  assert.equal(r.status, 200);
  const result = await r.json();
  assert.equal(result.subtotal, product.price);
  assert.equal(result.total, product.price + 200000);
});
test('unsupported delivery address cannot check out', async () => {
  const data = input();
  data.address = { ...address, country: 'Unsupported' };
  assert.equal((await request('/checkout/quote', 'POST', data)).status, 400);
});
test('duplicate cart variant entries are rejected', async () => {
  const data = input();
  data.items.push(data.items[0]);
  assert.equal((await request('/checkout/quote', 'POST', data)).status, 400);
});
test('checkout is idempotent and reserves stock without reducing physical inventory', async () => {
  const data = input(2);
  const before = (await query('SELECT quantity FROM inventory WHERE variant_id=$1', [variant.id])).rows[0]
    .quantity;
  const a = await createCheckout(data, user),
    b = await createCheckout(data, user);
  assert.equal(a.id, b.id);
  assert.equal(
    (await query('SELECT quantity FROM inventory WHERE variant_id=$1', [variant.id])).rows[0].quantity,
    before,
  );
  assert.equal(
    (await query('SELECT count(*)::int AS n FROM orders WHERE checkout_key=$1', [data.checkout_key])).rows[0]
      .n,
    1,
  );
  await assert.rejects(
    () => createCheckout({ ...data, items: [{ variant_id: variant.id, quantity: 3 }] }, user),
    /details changed/,
  );
});
test('concurrent checkout attempts cannot oversell stock', async () => {
  await query('UPDATE inventory SET quantity=3 WHERE variant_id=$1', [variant.id]);
  const results = await Promise.allSettled([createCheckout(input(), user), createCheckout(input(), user)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  await query('UPDATE inventory SET quantity=25 WHERE variant_id=$1', [variant.id]);
});
test('wrong currency, amount, reference, provider and metadata are rejected', async () => {
  const o = { provider: 'paystack', payment_reference: 'r', total: 10000, currency: 'NGN', id: 'id' };
  const p = {
    provider: 'paystack',
    reference: 'r',
    transaction: 'tx',
    status: 'success',
    amount: 10000,
    currency: 'NGN',
    orderId: 'id',
  };
  for (const change of [
    { amount: 1 },
    { currency: 'USD' },
    { reference: 'other' },
    { provider: 'stripe' },
    { orderId: 'different' },
    { status: 'pending' },
  ])
    assert.throws(() => validatePayment(o, { ...p, ...change }));
});
test('verified payment reduces inventory exactly once and queues real notifications', async () => {
  const result = await createCheckout(input(), user);
  const o = (await query('SELECT * FROM orders WHERE id=$1', [result.id])).rows[0];
  const stock = (await query('SELECT quantity FROM inventory WHERE variant_id=$1', [variant.id])).rows[0]
    .quantity;
  const payment = {
    provider: o.provider,
    reference: o.payment_reference,
    transaction: randomUUID(),
    status: 'success',
    amount: o.total,
    currency: o.currency,
    orderId: o.id,
  };
  await settlePayment(payment);
  await settlePayment(payment);
  assert.equal(
    (await query('SELECT quantity FROM inventory WHERE variant_id=$1', [variant.id])).rows[0].quantity,
    stock - 1,
  );
  assert.equal((await query('SELECT * FROM payments WHERE order_id=$1', [o.id])).rows.length, 1);
  assert.equal((await query('SELECT * FROM notifications WHERE order_id=$1', [o.id])).rows.length, 2);
  assert.equal(
    (await query('SELECT * FROM email_outbox WHERE dedupe_key=$1', ['paid-' + o.id])).rows.length,
    1,
  );
});
test('customers cannot read another customer’s order', async () => {
  const result = await createCheckout(input(), admin);
  assert.equal((await request('/orders/' + result.id)).status, 404);
});
test('coupons apply only to eligible subtotal and enforce limits', async () => {
  await query(
    "INSERT INTO coupons(code,kind,value,usage_limit,minimum,maximum) VALUES('TEST10','percentage',10,1,10000,300000)",
  );
  const data = { ...input(), coupon: 'TEST10' };
  const q = await calculate({ query }, data);
  assert.equal(q.discount, Math.min(Math.floor(product.price * 0.1), 300000));
  await createCheckout(data, user);
  await assert.rejects(() => createCheckout({ ...data, checkout_key: randomUUID() }, user), /usage limit/);
});
test('invalid webhook signature is rejected', () => {
  assert.throws(() => checkSignature('paystack', '{}', new Headers({ 'x-paystack-signature': 'bad' })));
});
test('Paystack validates the exact raw payload', () => {
  const raw = '{"event":"charge.success", "data":{}}';
  const signature = createHmac('sha512', config.paystackSecret).update(raw).digest('hex');
  assert.equal(
    checkSignature('paystack', raw, new Headers({ 'x-paystack-signature': signature })).event,
    'charge.success',
  );
  assert.throws(() =>
    checkSignature('paystack', raw + ' ', new Headers({ 'x-paystack-signature': signature })),
  );
});
test('Flutterwave HMAC and explicitly selected legacy modes are verified', () => {
  config.flutterwaveHash = 'secret';
  config.flutterwaveMode = 'hmac';
  const raw = '{}';
  const signature = createHmac('sha256', 'secret').update(raw).digest('base64');
  assert.deepEqual(
    checkSignature('flutterwave', raw, new Headers({ 'flutterwave-signature': signature })),
    {},
  );
  assert.throws(() => checkSignature('flutterwave', raw, new Headers({ 'verif-hash': 'secret' })));
  config.flutterwaveMode = 'legacy';
  assert.deepEqual(checkSignature('flutterwave', raw, new Headers({ 'verif-hash': 'secret' })), {});
  config.flutterwaveMode = 'hmac';
});
test('late payment without stock is recorded but cannot trigger fulfilment', async () => {
  const result = await createCheckout(input(), user);
  const o = (await query('SELECT * FROM orders WHERE id=$1', [result.id])).rows[0];
  await query("UPDATE orders SET stock_state='released',reserved_until=now()-interval '1 hour' WHERE id=$1", [
    o.id,
  ]);
  await query('UPDATE inventory SET quantity=0 WHERE variant_id=$1', [variant.id]);
  await settlePayment({
    provider: o.provider,
    reference: o.payment_reference,
    transaction: randomUUID(),
    status: 'success',
    amount: o.total,
    currency: o.currency,
  });
  const resultOrder = (await query('SELECT * FROM orders WHERE id=$1', [o.id])).rows[0];
  assert.equal(resultOrder.payment_status, 'paid');
  assert.equal(resultOrder.status, 'cancelled');
  assert.equal(
    (await query('SELECT quantity FROM inventory WHERE variant_id=$1', [variant.id])).rows[0].quantity,
    0,
  );
  await query('UPDATE inventory SET quantity=25 WHERE variant_id=$1', [variant.id]);
});
test('fulfilment cannot be advanced for an unpaid order', async () => {
  const result = await createCheckout(input(), user);
  await assert.rejects(() => updateOrder(result.id, { status: 'shipped', min_days: 3, max_days: 5 }, admin));
});
test('only verified delivered purchases can be reviewed', async () => {
  assert.equal(
    (await request('/reviews', 'POST', { product_id: product.id, rating: 5, body: 'An excellent item.' }))
      .status,
    403,
  );
});
test('spreadsheet exports neutralize formula injection', () => {
  const result = csv([{ name: '=HYPERLINK("bad")', email: '+malicious', message: 'normal, text' }]);
  assert.ok(result.includes("'=HYPERLINK"));
  assert.ok(result.includes("'+malicious"));
});
test('checkout rejects a stale reviewed total', async () => {
  await assert.rejects(
    () => createCheckout({ ...input(), reviewed_total: 1, reviewed_currency: 'NGN' }, user),
    /total changed/,
  );
});
test('login issues HttpOnly session and authoritative role', async () => {
  const r = await request(
    '/auth/login',
    'POST',
    { email: 'owner@example.test', password: 'A-secure-test-password', remember: true },
    false,
  );
  assert.equal(r.status, 200);
  assert.ok(r.headers.get('set-cookie')?.includes('HttpOnly'));
  assert.ok(r.headers.get('set-cookie')?.includes('Max-Age'));
  assert.equal((await r.json()).user.role, 'super_admin');
});
test('admin lists, searches, stats and settings query real records', async () => {
  const session = await newSession({ query }, admin.id, false);
  const h = { Cookie: session.cookie.split(';')[0], 'X-CSRF-Token': session.csrf };
  for (const route of [
    'orders?q=Test',
    'customers?q=buyer',
    'products?q=SAMPLE',
    'inventory?q=SAMPLE',
    'categories',
    'delivery',
    'coupons',
    'reviews',
    'newsletter',
    'contacts',
    'notifications',
    'payments',
    'audit-log',
    'dashboard',
    'config',
    'settings',
  ]) {
    const r = await request('/admin/' + route, 'GET', undefined, true, h);
    assert.equal(r.status, 200, route + ': ' + (await r.text()));
  }
});
test('admin can create and edit actual catalog and content records', async () => {
  const session = await newSession({ query }, admin.id, false);
  const h = { Cookie: session.cookie.split(';')[0], 'X-CSRF-Token': session.csrf };
  const c = await request(
    '/admin/categories',
    'POST',
    { name: 'Test category', slug: 'test-category', image: '', position: 6 },
    true,
    h,
  );
  assert.equal(c.status, 200);
  const category = await c.json();
  const r = await request(
    '/admin/products',
    'POST',
    {
      name: 'Test product',
      slug: 'test-product',
      sku: 'TEST-NEW',
      description: 'A real test product.',
      price: 100000,
      image: '/hero.jpg',
      category_ids: [category.id],
      variants: [{ sku: 'TEST-NEW-STD', name: 'Standard', quantity: 5 }],
      visible: true,
    },
    true,
    h,
  );
  assert.equal(r.status, 200, await r.clone().text());
  const id = (await r.json()).id;
  const saved = await (await request('/admin/products/' + id, 'GET', undefined, true, h)).json();
  assert.equal(saved.variants[0].quantity, 5);
  saved.price = 120000;
  assert.equal((await request('/admin/products/' + id, 'PUT', saved, true, h)).status, 200);
  const content = await (await request('/admin/settings', 'GET', undefined, true, h)).json();
  content.store.name = 'Okpora';
  assert.equal((await request('/admin/settings', 'PUT', content, true, h)).status, 200);
  assert.equal((await request('/admin/products/' + id, 'DELETE', undefined, true, h)).status, 200);
  assert.equal((await request('/products/test-product', 'GET', undefined, false)).status, 404);
});
test('newsletter and contact submissions persist without fake success', async () => {
  assert.equal(
    (await request('/newsletter', 'POST', { email: 'subscriber@example.test', consent: true }, false)).status,
    200,
  );
  assert.equal(
    (await query("SELECT * FROM newsletter_subscribers WHERE email='subscriber@example.test'")).rows.length,
    1,
  );
  assert.equal(
    (
      await request(
        '/contact',
        'POST',
        {
          name: 'Test Contact',
          email: 'contact@example.test',
          message: 'Please help me with a product question.',
        },
        false,
      )
    ).status,
    200,
  );
  assert.equal((await query('SELECT * FROM contact_submissions')).rows.length, 1);
});
test('wishlist add and removal persist per account', async () => {
  assert.equal((await request('/wishlist', 'POST', { product_id: product.id })).status, 200);
  assert.equal((await (await request('/wishlist')).json()).length, 1);
  assert.equal((await request('/wishlist/' + product.id, 'DELETE')).status, 200);
  assert.equal((await (await request('/wishlist')).json()).length, 0);
});
test('password reset tokens are one-use and revoke existing sessions', async () => {
  const raw = 'a'.repeat(64);
  await query(
    "INSERT INTO auth_tokens(token_hash,user_id,purpose,expires_at) VALUES($1,$2,'reset',now()+interval '1 hour')",
    [hash(raw), user.id],
  );
  const r = await request('/auth/reset', 'POST', { token: raw, password: 'My-new-secure-password' }, false);
  assert.equal(r.status, 200);
  assert.equal(
    (await request('/auth/reset', 'POST', { token: raw, password: 'Another-new-password' }, false)).status,
    400,
  );
  assert.equal((await request('/orders')).status, 401);
});

test('refund verification rejects another order or a partial amount', () => {
  const expected = { transaction: '123', amount: 250000, currency: 'NGN' };
  assert.throws(() =>
    validateRefund('paystack', { transaction: { id: 456 }, amount: 250000, currency: 'NGN' }, expected),
  );
  assert.throws(() =>
    validateRefund('paystack', { transaction: { id: 123 }, amount: 100000, currency: 'NGN' }, expected),
  );
  assert.doesNotThrow(() =>
    validateRefund('paystack', { transaction: { id: 123 }, amount: 250000, currency: 'NGN' }, expected),
  );
});

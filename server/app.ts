import { z } from 'zod';
import { query, tx } from './db';
import { body, json, fail, HttpError, email, paging, uuid } from './http';
import { config } from './config/index';
import { currentUser, requireUser, checkOrigin, checkCsrf, rateLimit } from './auth/security';
import { authRoutes } from './auth/routes';
import { products, product, productSelect } from './catalog';
import { adminRoutes } from './admin';
import {
  calculate,
  checkoutSchema,
  createCheckout,
  orderDetails,
  verifyOrder,
  addressSchema,
} from './orders/service';
export async function handleRequest(req: Request) {
  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/\.netlify\/functions\/api/, '').replace(/^\/api/, '') || '/';
    if (path === '/health')
      return json({ service: 'Okpora', status: config.databaseUrl ? 'configured' : 'setup_required' });
    checkOrigin(req);
    const ip = req.headers.get('x-nf-client-connection-ip') || 'local';
    await rateLimit('api:' + ip, 300, 60);
    if (path.startsWith('/auth/') && req.method === 'POST') {
      await rateLimit('auth:' + ip, 40, 900);
      const response = await authRoutes(req, path);
      if (response) return response;
    }
    if (path === '/store' && req.method === 'GET') {
      const rows = (await query('SELECT key,value FROM site_settings')).rows;
      return json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
    }
    if (path === '/categories' && req.method === 'GET')
      return json((await query('SELECT * FROM categories ORDER BY position,name')).rows);
    if (path === '/products' && req.method === 'GET') return json(await products(url));
    if (path.startsWith('/products/') && req.method === 'GET')
      return json(await product(decodeURIComponent(path.split('/')[2])));
    if (path === '/me' && req.method === 'GET') {
      const user = await currentUser(req);
      if (!user) return json({ user: null });
      const { csrf_token, ...safe } = user;
      return json({ user: safe, csrf: csrf_token });
    }
    if (path === '/newsletter' && req.method === 'POST') {
      await rateLimit('newsletter:' + ip, 5, 3600);
      const input = await body(
        req,
        z.object({ email, consent: z.literal(true), website: z.string().max(0).default('') }),
      );
      await query('INSERT INTO newsletter_subscribers(email) VALUES($1) ON CONFLICT DO NOTHING', [
        input.email,
      ]);
      return json({ message: 'You are on the list. Thank you!' });
    }
    if (path === '/contact' && req.method === 'POST') {
      await rateLimit('contact:' + ip, 5, 3600);
      const input = await body(
        req,
        z.object({
          name: z.string().trim().min(2).max(150),
          email,
          message: z.string().trim().min(10).max(5000),
          website: z.string().max(0).default(''),
        }),
      );
      await query('INSERT INTO contact_submissions(name,email,message) VALUES($1,$2,$3)', [
        input.name,
        input.email,
        input.message,
      ]);
      return json({ message: 'Your message has been received. We will get back to you.' });
    }
    const user = await requireUser(req, path.startsWith('/admin'));
    checkCsrf(req, user);
    if (path.startsWith('/admin')) {
      const result = await adminRoutes(req, path, url, user);
      if (result) return result;
    }
    if (path === '/profile' && req.method === 'PATCH') {
      const input = await body(
        req,
        z.object({ name: z.string().trim().min(2).max(150), phone: z.string().max(30) }),
      );
      await query('UPDATE users SET name=$2,phone=$3 WHERE id=$1', [user.id, input.name, input.phone]);
      return json({ ok: true });
    }
    if (path === '/addresses' && req.method === 'GET')
      return json((await query('SELECT * FROM addresses WHERE user_id=$1 ORDER BY label', [user.id])).rows);
    if (path === '/addresses' && req.method === 'POST') {
      const input = await body(req, z.object({ label: z.string().min(1).max(50), details: addressSchema }));
      if (
        Number((await query('SELECT count(*) AS n FROM addresses WHERE user_id=$1', [user.id])).rows[0].n) >=
        20
      )
        fail(400, 'You can save up to 20 addresses.');
      return json(
        (
          await query('INSERT INTO addresses(user_id,label,details) VALUES($1,$2,$3) RETURNING *', [
            user.id,
            input.label,
            input.details,
          ])
        ).rows[0],
      );
    }
    if (path.startsWith('/addresses/') && req.method === 'DELETE') {
      await query('DELETE FROM addresses WHERE id=$1 AND user_id=$2', [
        uuid.parse(path.split('/')[2]),
        user.id,
      ]);
      return json({ ok: true });
    }
    if (path === '/cart' && req.method === 'GET')
      return json(
        (
          await query(
            `SELECT ci.variant_id,ci.quantity,p.id AS product_id,p.name,p.slug,p.image,v.name AS variant,COALESCE(v.price,p.price) AS price FROM carts c JOIN cart_items ci ON ci.cart_id=c.id JOIN product_variants v ON v.id=ci.variant_id JOIN products p ON p.id=v.product_id WHERE c.user_id=$1`,
            [user.id],
          )
        ).rows,
      );
    if (path === '/cart' && req.method === 'PUT') {
      const input = await body(
        req,
        z.object({
          items: z.array(z.object({ variant_id: uuid, quantity: z.number().int().min(1).max(99) })).max(100),
        }),
      );
      await tx(async (db) => {
        await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
        const cart = (
          await db.query(
            'INSERT INTO carts(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET updated_at=now() RETURNING id',
            [user.id],
          )
        ).rows[0];
        await db.query('DELETE FROM cart_items WHERE cart_id=$1', [cart.id]);
        for (const item of input.items)
          await db.query('INSERT INTO cart_items(cart_id,variant_id,quantity) VALUES($1,$2,$3)', [
            cart.id,
            item.variant_id,
            item.quantity,
          ]);
      });
      return json({ ok: true });
    }
    if (path === '/wishlist' && req.method === 'GET')
      return json(
        (
          await query(
            productSelect +
              ' WHERE p.visible AND p.id IN(SELECT wi.product_id FROM wishlist_items wi JOIN wishlists w ON w.id=wi.wishlist_id WHERE w.user_id=$1)',
            [user.id],
          )
        ).rows,
      );
    if (path === '/wishlist' && req.method === 'POST') {
      const input = await body(req, z.object({ product_id: uuid }));
      await tx(async (db) => {
        const list = (
          await db.query(
            'INSERT INTO wishlists(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET user_id=$1 RETURNING id',
            [user.id],
          )
        ).rows[0];
        await db.query(
          'INSERT INTO wishlist_items(wishlist_id,product_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [list.id, input.product_id],
        );
      });
      return json({ ok: true });
    }
    if (path.startsWith('/wishlist/') && req.method === 'DELETE') {
      await query(
        'DELETE FROM wishlist_items WHERE product_id=$1 AND wishlist_id IN(SELECT id FROM wishlists WHERE user_id=$2)',
        [uuid.parse(path.split('/')[2]), user.id],
      );
      return json({ ok: true });
    }
    if (path === '/checkout/quote' && req.method === 'POST') {
      const input = await body(req, checkoutSchema);
      return json(await calculate({ query }, input));
    }
    if (path === '/checkout' && req.method === 'POST') {
      await rateLimit('checkout:' + user.id, 15, 3600);
      const input = await body(req, checkoutSchema);
      if (input.reviewed_total === undefined || !input.reviewed_currency)
        fail(400, 'Review your order before paying.');
      return json(await createCheckout(input, user));
    }
    if (path === '/orders' && req.method === 'GET') {
      const { page, limit } = paging(url);
      const total = (await query('SELECT count(*)::int AS n FROM orders WHERE user_id=$1', [user.id])).rows[0]
        .n;
      const items = (
        await query(
          'SELECT id,number,total,currency,status,payment_status,created_at,min_days,max_days FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
          [user.id, limit, (page - 1) * limit],
        )
      ).rows;
      return json({ items, total, page, pages: Math.ceil(total / limit) });
    }
    if (path.startsWith('/orders/') && req.method === 'GET')
      return json(await orderDetails(path.split('/')[2], user));
    if (path === '/payments/verify' && req.method === 'POST') {
      await rateLimit('verify:' + user.id, 30, 300);
      const input = await body(req, z.object({ order_id: uuid }));
      const o = await verifyOrder(input.order_id, user);
      return json({
        id: o.id,
        number: o.number,
        status: o.status,
        payment_status: o.payment_status,
        total: o.total,
        currency: o.currency,
        items: (await query('SELECT variant_id,quantity FROM order_items WHERE order_id=$1', [o.id])).rows,
      });
    }
    if (path === '/reviews' && req.method === 'POST') {
      const input = await body(
        req,
        z.object({
          product_id: uuid,
          rating: z.number().int().min(1).max(5),
          body: z.string().trim().min(5).max(3000),
        }),
      );
      const eligible = (
        await query(
          `SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.user_id=$1 AND oi.product_id=$2 AND o.payment_status='paid' AND o.status='delivered' LIMIT 1`,
          [user.id, input.product_id],
        )
      ).rows.length;
      if (!eligible) fail(403, 'Reviews are available after your purchased item is delivered.');
      await tx(async (db) => {
        await db.query(
          `INSERT INTO reviews(user_id,product_id,rating,body) VALUES($1,$2,$3,$4) ON CONFLICT(product_id,user_id) DO UPDATE SET rating=$3,body=$4,status='pending'`,
          [user.id, input.product_id, input.rating, input.body],
        );
        await db.query(
          `INSERT INTO notifications(audience,title,body) VALUES('admin','New review','A verified purchase review is waiting for moderation.')`,
        );
      });
      return json({ message: 'Thank you. Your review is awaiting approval.' });
    }
    if (path === '/notifications' && req.method === 'GET')
      return json(
        (
          await query(
            "SELECT * FROM notifications WHERE user_id=$1 AND audience='customer' ORDER BY created_at DESC LIMIT 100",
            [user.id],
          )
        ).rows,
      );
    if (path.startsWith('/notifications/') && req.method === 'PATCH') {
      await query('UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2', [
        uuid.parse(path.split('/')[2]),
        user.id,
      ]);
      return json({ ok: true });
    }
    return json({ error: 'This page could not be found.' }, 404);
  } catch (e: any) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e instanceof z.ZodError)
      return json({ error: 'Some details are invalid. Please check the form.' }, 400);
    if (e.code === '23505') return json({ error: 'A record with these details already exists.' }, 409);
    if (['23503', '23514', '22P02'].includes(e.code))
      return json({ error: 'Some details could not be saved. Please check your entries.' }, 400);
    if (e.message === 'CONFIGURATION_DATABASE')
      return json({ error: 'The store is being prepared. Please check back soon.' }, 503);
    console.error('Okpora request failed', { code: e.code || e.name });
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
}

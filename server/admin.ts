import { z } from 'zod';
import { query, tx } from './db';
import { body, fail, json, paging, csv, uuid, safeUrl, email } from './http';
import { type User, passwordHash } from './auth/security';
import { missingConfig, config } from './config/index';
import { updateOrder, orderDetails } from './orders/service';
import * as gateway from './payments/providers';
import { drainEmail, queueEmail } from './email/index';
const money = z.number().int().min(0).max(100000000);
const categorySchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(120),
  image: safeUrl.default(''),
  position: z.number().int().min(0).default(0),
});
const variantSchema = z.object({
  id: uuid.optional(),
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  size: z.string().max(50).default(''),
  color: z.string().max(50).default(''),
  price: money.nullable().default(null),
  active: z.boolean().default(true),
  quantity: z.number().int().min(0).max(1000000),
  low_stock_threshold: z.number().int().min(0).default(5),
});
const productSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(220),
  sku: z.string().min(1).max(100),
  description: z.string().max(20000),
  brand: z.string().max(100).default(''),
  price: money,
  compare_price: money.nullable().default(null),
  image: safeUrl,
  featured: z.boolean().default(false),
  new_arrival: z.boolean().default(false),
  visible: z.boolean().default(true),
  attributes: z.record(z.string().max(100), z.string().max(500)).default({}),
  category_ids: z.array(uuid).max(30),
  images: z.array(safeUrl).max(20).default([]),
  variants: z.array(variantSchema).min(1).max(100),
});
const zoneSchema = z
  .object({
    name: z.string().min(1).max(100),
    country: z.string().min(2).max(100),
    region: z.string().max(100).default(''),
    city: z.string().max(100).default(''),
    fee: money,
    free_threshold: money.nullable().default(null),
    min_days: z.number().int().min(0).max(365),
    max_days: z.number().int().min(0).max(365),
    active: z.boolean().default(true),
  })
  .refine((v) => v.max_days >= v.min_days, 'Maximum days must be at least minimum days');
const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .transform((s) => s.toUpperCase()),
    kind: z.enum(['percentage', 'fixed', 'free_shipping']),
    value: money,
    starts_at: z.string().datetime().nullable().default(null),
    expires_at: z.string().datetime().nullable().default(null),
    usage_limit: z.number().int().positive().nullable().default(null),
    minimum: money.default(0),
    maximum: money.nullable().default(null),
    product_ids: z.array(uuid).default([]),
    category_ids: z.array(uuid).default([]),
    active: z.boolean().default(true),
  })
  .refine((v) => v.kind !== 'percentage' || v.value <= 100, 'Percentage cannot exceed 100');
const storeSchema = z.object({
  name: z.string().min(1).max(100),
  currency: z.enum(['NGN', 'USD', 'GBP', 'EUR', 'GHS', 'KES', 'ZAR']),
  announcement: z.string().max(300),
  hero_title: z.string().max(200),
  hero_text: z.string().max(1000),
  hero_image: safeUrl,
  hero_label: z.string().max(100),
  logo: safeUrl.optional(),
  email: z.union([email, z.literal('')]),
  phone: z.string().max(50),
  address: z.string().max(500),
  whatsapp: z.string().regex(/^\+?[\d ]*$/),
  instagram: safeUrl,
  facebook: safeUrl,
  footer: z.string().max(1000),
  tax_percent: z.number().min(0).max(100),
  about: z.string().max(20000),
  faqs: z
    .array(
      z.object({
        category: z.string().max(100),
        question: z.string().max(500),
        answer: z.string().max(3000),
      }),
    )
    .max(100),
});
export async function adminRoutes(req: Request, path: string, url: URL, user: User) {
  const parts = path.split('/').filter(Boolean);
  const resource = parts[1],
    id = parts[2];
  const method = req.method;
  if (resource === 'config' && method === 'GET')
    return json({
      missing: missingConfig('all'),
      payment_provider: config.provider,
      storage_configured: !!(config.supabaseUrl && config.supabaseKey),
      email_pending: (await query("SELECT count(*)::int AS count FROM email_outbox WHERE status='pending'"))
        .rows[0].count,
    });
  if (resource === 'email-retry' && method === 'POST') {
    await query(
      "UPDATE email_outbox SET attempts=0,available_at=now() WHERE status='pending' AND attempts>=10",
    );
    return json(await drainEmail());
  }
  if ((resource === 'dashboard' || resource === 'analytics') && method === 'GET') {
    const [summary, daily, top, growth] = await Promise.all([
      query(
        `SELECT count(*)::int AS orders,count(*) FILTER(WHERE payment_status='paid')::int AS paid_orders,COALESCE(sum(total) FILTER(WHERE payment_status='paid'),0)::bigint AS revenue,count(*) FILTER(WHERE payment_status='pending')::int AS pending_orders,count(*) FILTER(WHERE status='processing')::int AS processing,count(*) FILTER(WHERE status='shipped')::int AS shipped,count(*) FILTER(WHERE status='delivered')::int AS delivered,count(*) FILTER(WHERE status='cancelled')::int AS cancelled,(SELECT count(*)::int FROM products WHERE visible) AS products,(SELECT count(*)::int FROM users WHERE role='customer') AS customers,(SELECT count(*)::int FROM inventory WHERE quantity<=low_stock_threshold) AS low_stock FROM orders`,
      ),
      query(
        `SELECT to_char(date_trunc('day',created_at),'YYYY-MM-DD') AS day,count(*)::int AS orders,COALESCE(sum(total) FILTER(WHERE payment_status='paid'),0)::bigint AS revenue FROM orders WHERE created_at>=now()-interval '30 days' GROUP BY 1 ORDER BY 1`,
      ),
      query(
        `SELECT oi.name,sum(oi.quantity)::int AS quantity,sum(oi.quantity*oi.price)::bigint AS revenue FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.payment_status='paid' GROUP BY oi.name ORDER BY revenue DESC LIMIT 10`,
      ),
      query(
        `SELECT to_char(date_trunc('day',created_at),'YYYY-MM-DD') AS day,count(*)::int AS customers FROM users WHERE created_at>=now()-interval '30 days' GROUP BY 1 ORDER BY 1`,
      ),
    ]);
    return json({ summary: summary.rows[0], daily: daily.rows, top: top.rows, growth: growth.rows });
  }
  if (resource === 'orders' && id) {
    if (method === 'GET') return json(await orderDetails(id, user));
    if (method === 'PATCH') {
      const input = await body(
        req,
        z
          .object({
            status: z
              .enum([
                'pending_payment',
                'paid',
                'confirmed',
                'processing',
                'packed',
                'shipped',
                'out_for_delivery',
                'delivered',
                'cancelled',
              ])
              .optional(),
            min_days: z.number().int().min(0).max(365),
            max_days: z.number().int().min(0).max(365),
            courier: z.string().max(100).optional(),
            tracking_number: z.string().max(150).optional(),
            tracking_url: safeUrl.optional(),
            admin_note: z.string().max(5000).optional(),
          })
          .refine((x) => x.max_days >= x.min_days, 'Check delivery day range'),
      );
      return json(await updateOrder(id, input, user));
    }
  }
  if (resource === 'refunds' && id && method === 'POST') {
    if (user.role !== 'super_admin') fail(403, 'Only a super administrator can issue refunds.');
    const o = await tx(async (db) => {
      const order = (await db.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!order || order.payment_status !== 'paid') fail(400, 'Only paid orders can be refunded.');
      if ((await db.query('SELECT order_id FROM refund_requests WHERE order_id=$1', [id])).rows.length)
        fail(409, 'A refund request already exists. Check the gateway before retrying.');
      await db.query('INSERT INTO refund_requests(order_id,requested_by) VALUES($1,$2)', [id, user.id]);
      await db.query("UPDATE orders SET payment_status='refund_pending' WHERE id=$1", [id]);
      await db.query(
        `INSERT INTO audit_logs(admin_id,action,object_type,object_id) VALUES($1,'Refund requested','order',$2)`,
        [user.id, id],
      );
      return order;
    });
    const p = (await query('SELECT * FROM payments WHERE order_id=$1', [id])).rows[0];
    try {
      const result = await gateway.requestRefund(o, p);
      await query('UPDATE refund_requests SET provider_ref=$2,status=$3 WHERE order_id=$1', [
        id,
        result.id,
        result.status,
      ]);
      return json({ message: 'Refund requested. Final status will be verified with the provider.' });
    } catch (e) {
      await query("UPDATE refund_requests SET status='needs_reconciliation' WHERE order_id=$1", [id]);
      throw e;
    }
  }
  if (resource === 'refund-reconcile' && id && method === 'POST') {
    if (user.role !== 'super_admin') fail(403, 'Super administrator required.');
    const input = await body(req, z.object({ provider_ref: z.string().min(1).max(200) }));
    await query('UPDATE refund_requests SET provider_ref=$2 WHERE order_id=$1', [id, input.provider_ref]);
    return json({ ok: true });
  }
  if (resource === 'products' && id && method === 'GET') {
    const p = (await query('SELECT * FROM products WHERE id=$1', [id])).rows[0];
    if (!p) fail(404, 'Product not found.');
    const variants = (
      await query(
        'SELECT v.*,i.quantity,i.low_stock_threshold FROM product_variants v JOIN inventory i ON i.variant_id=v.id WHERE product_id=$1 ORDER BY v.name',
        [id],
      )
    ).rows;
    const images = (
      await query('SELECT url FROM product_images WHERE product_id=$1 ORDER BY position', [id])
    ).rows.map((r) => r.url);
    const category_ids = (
      await query('SELECT category_id FROM product_categories WHERE product_id=$1', [id])
    ).rows.map((r) => r.category_id);
    return json({ ...p, variants, images, category_ids });
  }
  if (resource === 'products' && ['POST', 'PUT'].includes(method)) {
    const input = await body(req, productSchema);
    const productId = await tx(async (db) => {
      const fields = [
        'name',
        'slug',
        'sku',
        'description',
        'brand',
        'price',
        'compare_price',
        'image',
        'featured',
        'new_arrival',
        'visible',
        'attributes',
      ] as const;
      let pid = id;
      if (id) {
        if (!(await db.query('SELECT id FROM products WHERE id=$1 FOR UPDATE', [id])).rows.length)
          fail(404, 'Product not found.');
        await db.query(
          'UPDATE products SET ' +
            fields.map((f, i) => `${f}=$${i + 2}`).join(',') +
            ',updated_at=now() WHERE id=$1',
          [id, ...fields.map((f) => input[f])],
        );
      } else
        pid = (
          await db.query(
            'INSERT INTO products(' +
              fields.join(',') +
              ') VALUES(' +
              fields.map((_, i) => `$${i + 1}`).join(',') +
              ') RETURNING id',
            fields.map((f) => input[f]),
          )
        ).rows[0].id;
      await db.query('DELETE FROM product_categories WHERE product_id=$1', [pid]);
      for (const cid of input.category_ids)
        await db.query('INSERT INTO product_categories VALUES($1,$2)', [pid, cid]);
      await db.query('DELETE FROM product_images WHERE product_id=$1', [pid]);
      for (const [position, url] of input.images.entries())
        await db.query('INSERT INTO product_images(product_id,url,position) VALUES($1,$2,$3)', [
          pid,
          url,
          position,
        ]);
      const previous = (
        await db.query('SELECT id FROM product_variants WHERE product_id=$1', [pid])
      ).rows.map((r) => r.id);
      const retained = input.variants.filter((v) => v.id).map((v) => v.id);
      for (const old of previous)
        if (!retained.includes(old))
          await db.query('UPDATE product_variants SET active=false WHERE id=$1', [old]);
      for (const v of input.variants) {
        let vid = v.id;
        if (vid) {
          if (!previous.includes(vid)) fail(400, 'Invalid variant.');
          await db.query(
            'UPDATE product_variants SET sku=$2,name=$3,size=$4,color=$5,price=$6,active=$7 WHERE id=$1',
            [vid, v.sku, v.name, v.size, v.color, v.price, v.active],
          );
        } else
          vid = (
            await db.query(
              'INSERT INTO product_variants(product_id,sku,name,size,color,price,active) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
              [pid, v.sku, v.name, v.size, v.color, v.price, v.active],
            )
          ).rows[0].id;
        await db.query('SELECT variant_id FROM inventory WHERE variant_id=$1 FOR UPDATE', [vid]);
        const reserved = Number(
          (
            await db.query(
              `SELECT COALESCE(sum(oi.quantity),0) AS n FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.variant_id=$1 AND o.stock_state='reserved' AND o.reserved_until>now()`,
              [vid],
            )
          ).rows[0].n,
        );
        if (v.quantity < reserved) fail(409, 'Stock cannot be set below active checkout reservations.');
        await db.query(
          'INSERT INTO inventory(variant_id,quantity,low_stock_threshold) VALUES($1,$2,$3) ON CONFLICT(variant_id) DO UPDATE SET quantity=$2,low_stock_threshold=$3',
          [vid, v.quantity, v.low_stock_threshold],
        );
      }
      await db.query('INSERT INTO audit_logs(admin_id,action,object_type,object_id) VALUES($1,$2,$3,$4)', [
        user.id,
        id ? 'Product updated' : 'Product created',
        'product',
        pid,
      ]);
      return pid;
    });
    return json({ id: productId });
  }
  if (resource === 'products' && id && method === 'DELETE') {
    await tx(async (db) => {
      await db.query('UPDATE products SET visible=false WHERE id=$1', [id]);
      await db.query(
        `INSERT INTO audit_logs(admin_id,action,object_type,object_id) VALUES($1,'Product archived','product',$2)`,
        [user.id, id],
      );
    });
    return json({ ok: true });
  }
  const editable: Record<string, { table: string; schema: z.ZodType<any> }> = {
    categories: { table: 'categories', schema: categorySchema },
    delivery: { table: 'delivery_zones', schema: zoneSchema },
    coupons: { table: 'coupons', schema: couponSchema },
  };
  if (editable[resource] && ['POST', 'PUT', 'DELETE'].includes(method)) {
    const { table, schema } = editable[resource];
    let result: any = { ok: true };
    await tx(async (db) => {
      if (method === 'DELETE') {
        if (!id) fail(400, 'ID required.');
        if (resource === 'coupons' || resource === 'delivery')
          await db.query(`UPDATE ${table} SET active=false WHERE id=$1`, [id]);
        else await db.query(`DELETE FROM ${table} WHERE id=$1`, [id]);
      } else {
        const input = await body(req, schema);
        const fields = Object.keys(input);
        const vals = Object.values(input);
        if (id)
          result = (
            await db.query(
              `UPDATE ${table} SET ` +
                fields.map((f, i) => `${f}=$${i + 2}`).join(',') +
                ' WHERE id=$1 RETURNING *',
              [id, ...vals],
            )
          ).rows[0];
        else
          result = (
            await db.query(
              `INSERT INTO ${table}(${fields.join(',')}) VALUES(${fields.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`,
              vals,
            )
          ).rows[0];
      }
      await db.query('INSERT INTO audit_logs(admin_id,action,object_type,object_id) VALUES($1,$2,$3,$4)', [
        user.id,
        method,
        resource,
        id || result?.id,
      ]);
    });
    return json(result);
  }
  if (resource === 'reviews' && id && method === 'PATCH') {
    const input = await body(req, z.object({ status: z.enum(['approved', 'hidden', 'pending']) }));
    await tx(async (db) => {
      await db.query('UPDATE reviews SET status=$2 WHERE id=$1', [id, input.status]);
      await db.query(
        'INSERT INTO audit_logs(admin_id,action,object_type,object_id,details) VALUES($1,$2,$3,$4,$5)',
        [user.id, 'Review moderated', 'review', id, input],
      );
    });
    return json({ ok: true });
  }
  if (resource === 'customers' && id && method === 'GET') {
    const customer = (
      await query('SELECT id,name,email,phone,role,disabled,created_at FROM users WHERE id=$1', [id])
    ).rows[0];
    const orders = (
      await query(
        'SELECT number,total,currency,status,created_at FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',
        [id],
      )
    ).rows;
    return json({ customer, orders });
  }
  if (resource === 'customers' && id && method === 'PATCH') {
    if (user.role !== 'super_admin') fail(403, 'Only a super administrator can manage access.');
    const input = await body(
      req,
      z.object({ disabled: z.boolean(), role: z.enum(['customer', 'admin', 'super_admin']) }),
    );
    if (id === user.id) fail(400, 'You cannot change your own access.');
    await tx(async (db) => {
      await db.query('UPDATE users SET disabled=$2,role=$3 WHERE id=$1', [id, input.disabled, input.role]);
      await db.query('DELETE FROM sessions WHERE user_id=$1', [id]);
      await db.query(
        'INSERT INTO audit_logs(admin_id,action,object_type,object_id,details) VALUES($1,$2,$3,$4,$5)',
        [user.id, 'Access updated', 'user', id, input],
      );
    });
    return json({ ok: true });
  }
  if (resource === 'settings' || resource === 'content') {
    if (method === 'GET')
      return json(
        Object.fromEntries((await query('SELECT * FROM site_settings')).rows.map((r) => [r.key, r.value])),
      );
    if (method === 'PUT') {
      const input = await body(
        req,
        z.object({
          store: storeSchema,
          policies: z.record(
            z.enum(['privacy', 'terms', 'shipping', 'returns', 'refunds', 'cookies']),
            z.string().max(40000),
          ),
        }),
      );
      await tx(async (db) => {
        const current = (await db.query("SELECT value FROM site_settings WHERE key='store' FOR UPDATE"))
          .rows[0].value;
        if (
          current.currency !== input.store.currency &&
          (await db.query('SELECT 1 FROM orders LIMIT 1')).rows.length
        )
          fail(
            409,
            'Currency is locked after the first order. A multi-currency migration is required to change it.',
          );
        for (const [key, value] of Object.entries(input))
          await db.query(
            'INSERT INTO site_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2',
            [key, value],
          );
        await db.query(
          `INSERT INTO audit_logs(admin_id,action,object_type) VALUES($1,'Store content updated','settings')`,
          [user.id],
        );
      });
      return json({ ok: true });
    }
  }
  if (resource === 'upload' && method === 'POST') {
    if (!config.supabaseUrl || !config.supabaseKey)
      fail(503, 'Image uploads need storage configuration. You can use an HTTPS image URL instead.');
    const input = await body(
      req,
      z.object({
        name: z.string().max(150),
        type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        data: z.string().max(180000),
      }),
    );
    const bytes = Buffer.from(input.data, 'base64');
    const valid =
      input.type === 'image/jpeg'
        ? bytes[0] === 255 && bytes[1] === 216
        : input.type === 'image/png'
          ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
    if (!valid) fail(400, 'Invalid image data.');
    const key = crypto.randomUUID() + '.' + input.type.split('/')[1];
    const endpoint = `${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(config.storageBucket)}/${key}`;
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.supabaseKey}`, 'Content-Type': input.type },
      body: bytes,
    });
    if (!r.ok) fail(502, 'Image upload failed.');
    return json({ url: `${config.supabaseUrl}/storage/v1/object/public/${config.storageBucket}/${key}` });
  }
  const tables: Record<string, { sql: string; search: string; status?: string }> = {
    orders: {
      sql: `SELECT o.*,u.name AS customer,u.email,u.phone,(SELECT string_agg(oi.name||' × '||oi.quantity,', ') FROM order_items oi WHERE oi.order_id=o.id) AS products,(SELECT sum(oi.quantity)::int FROM order_items oi WHERE oi.order_id=o.id) AS quantity FROM orders o JOIN users u ON u.id=o.user_id`,
      search: "o.number||' '||u.name||' '||u.email||' '||o.payment_reference",
      status: 'o.status',
    },
    products: { sql: 'SELECT * FROM products', search: "name||' '||sku" },
    categories: { sql: 'SELECT * FROM categories', search: 'name' },
    customers: {
      sql: `SELECT u.id,u.name,u.email,u.phone,u.role,u.disabled,u.created_at,(SELECT count(*)::int FROM orders WHERE user_id=u.id) AS orders,(SELECT COALESCE(sum(total),0)::bigint FROM orders WHERE user_id=u.id AND payment_status='paid') AS total_spent,(SELECT max(created_at) FROM orders WHERE user_id=u.id AND payment_status='paid') AS recent_purchase FROM users u`,
      search: "u.name||' '||u.email",
    },
    payments: {
      sql: 'SELECT t.*,o.number,u.name AS customer FROM transactions t JOIN orders o ON o.id=t.order_id JOIN users u ON u.id=o.user_id',
      search: "t.reference||' '||o.number",
      status: 't.status',
    },
    inventory: {
      sql: `SELECT v.id,p.id AS product_id,p.name,v.name AS variant,v.sku,i.quantity,i.low_stock_threshold FROM inventory i JOIN product_variants v ON v.id=i.variant_id JOIN products p ON p.id=v.product_id WHERE v.active`,
      search: "p.name||' '||v.sku",
    },
    delivery: { sql: 'SELECT * FROM delivery_zones', search: 'name' },
    reviews: {
      sql: 'SELECT r.*,p.name AS product,u.name AS customer FROM reviews r JOIN products p ON p.id=r.product_id JOIN users u ON u.id=r.user_id',
      search: "p.name||' '||r.body",
      status: 'r.status',
    },
    coupons: { sql: 'SELECT * FROM coupons', search: 'code' },
    notifications: { sql: "SELECT * FROM notifications WHERE audience='admin'", search: "title||' '||body" },
    newsletter: { sql: 'SELECT * FROM newsletter_subscribers', search: 'email' },
    'audit-log': {
      sql: 'SELECT a.*,u.name AS administrator FROM audit_logs a LEFT JOIN users u ON u.id=a.admin_id',
      search: "a.action||' '||a.object_type",
    },
    contacts: { sql: 'SELECT * FROM contact_submissions', search: "name||' '||email||' '||message" },
  };
  if (tables[resource] && method === 'GET') {
    const { page, limit } = paging(url),
      t = tables[resource],
      values: any[] = [];
    let sql = t.sql;
    const conditions = [];
    if (url.searchParams.get('q')) {
      values.push('%' + url.searchParams.get('q')!.slice(0, 100) + '%');
      conditions.push('(' + t.search + ') ILIKE $' + values.length);
    }
    if (t.status && url.searchParams.get('status')) {
      values.push(url.searchParams.get('status'));
      conditions.push(t.status + '=$' + values.length);
    }
    if (conditions.length)
      sql +=
        (['inventory', 'notifications'].includes(resource) ? ' AND ' : ' WHERE ') + conditions.join(' AND ');
    const total = (await query('SELECT count(*)::int AS count FROM (' + sql + ') result', values)).rows[0]
      .count;
    const sort = url.searchParams.get('sort');
    let ordering =
      resource === 'categories'
        ? 'position ASC'
        : resource === 'inventory'
          ? 'quantity ASC'
          : resource === 'coupons' || resource === 'delivery'
            ? 'name ASC'
            : 'created_at DESC';
    if (resource === 'coupons') ordering = 'code ASC';
    if (resource === 'products' && sort === 'price') ordering = 'price ASC';
    if (resource === 'orders' && sort === 'total') ordering = 'total DESC';
    const exportCsv = url.searchParams.get('export') === 'csv';
    const items = (
      await query(
        'SELECT * FROM (' +
          sql +
          ') result ORDER BY ' +
          ordering +
          ` LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, exportCsv ? 10000 : limit, exportCsv ? 0 : (page - 1) * limit],
      )
    ).rows;
    if (exportCsv)
      return new Response(csv(items), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="okpora-${resource}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    return json({ items, total, page, pages: Math.ceil(total / limit) });
  }
  if (resource === 'notifications' && id && method === 'PATCH') {
    await query("UPDATE notifications SET read_at=now() WHERE id=$1 AND audience='admin'", [id]);
    return json({ ok: true });
  }
  return null;
}

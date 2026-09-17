import { query } from './db';
import { fail, paging } from './http';
export const productSelect = `SELECT p.*,COALESCE((SELECT avg(rating)::float FROM reviews WHERE product_id=p.id AND status='approved'),0) AS rating,(SELECT count(*)::int FROM reviews WHERE product_id=p.id AND status='approved') AS review_count,
 COALESCE((SELECT sum(GREATEST(0,i.quantity-COALESCE((SELECT sum(oi.quantity) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.variant_id=v.id AND o.stock_state='reserved' AND o.reserved_until>now()),0)))::int FROM product_variants v JOIN inventory i ON i.variant_id=v.id WHERE v.product_id=p.id AND v.active),0) AS stock,
 COALESCE((SELECT json_agg(json_build_object('id',c.id,'name',c.name,'slug',c.slug)) FROM categories c JOIN product_categories pc ON pc.category_id=c.id WHERE pc.product_id=p.id),'[]') AS categories,
 COALESCE((SELECT sum(oi.quantity) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.product_id=p.id AND o.payment_status='paid'),0)::int AS sold
 FROM products p`;
export async function products(url: URL) {
  const { page, limit } = paging(url);
  const values: any[] = [];
  const where = ['p.visible=true'];
  const add = (sql: string, value: any) => {
    values.push(value);
    where.push(sql.replaceAll('?', `$${values.length}`));
  };
  const q = url.searchParams.get('q')?.trim();
  if (q)
    add(
      `(p.name ILIKE ? OR p.description ILIKE ? OR p.sku ILIKE ? OR p.brand ILIKE ? OR p.attributes::text ILIKE ? OR EXISTS(SELECT 1 FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id=p.id AND c.name ILIKE ?))`,
      '%' + q.slice(0, 100) + '%',
    );
  if (url.searchParams.get('category'))
    add(
      'EXISTS(SELECT 1 FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id=p.id AND c.slug=?)',
      url.searchParams.get('category'),
    );
  if (url.searchParams.has('min')) add('p.price>=?', Math.max(0, Number(url.searchParams.get('min')) || 0));
  if (url.searchParams.has('max')) add('p.price<=?', Math.max(0, Number(url.searchParams.get('max')) || 0));
  if (url.searchParams.get('brand')) add('lower(p.brand)=lower(?)', url.searchParams.get('brand'));
  for (const key of ['size', 'color'])
    if (url.searchParams.get(key))
      add(
        `EXISTS(SELECT 1 FROM product_variants v WHERE v.product_id=p.id AND v.active AND lower(v.${key})=lower(?))`,
        url.searchParams.get(key),
      );
  if (url.searchParams.get('attribute'))
    add('p.attributes::text ILIKE ?', '%' + url.searchParams.get('attribute')?.slice(0, 100) + '%');
  if (url.searchParams.get('featured') === 'true') where.push('p.featured');
  if (url.searchParams.get('new') === 'true') where.push('p.new_arrival');
  if (url.searchParams.get('sale') === 'true') where.push('p.compare_price>p.price');
  let sql = productSelect + ' WHERE ' + where.join(' AND ');
  const outer = [];
  if (url.searchParams.get('stock') === 'true') outer.push('stock>0');
  if (url.searchParams.get('rating')) {
    values.push(Number(url.searchParams.get('rating')) || 0);
    outer.push('rating>=$' + values.length);
  }
  sql = 'SELECT * FROM (' + sql + ') catalog' + (outer.length ? ' WHERE ' + outer.join(' AND ') : '');
  const sorts: Record<string, string> = {
    newest: 'created_at DESC',
    price_asc: 'price ASC',
    price_desc: 'price DESC',
    rating: 'rating DESC',
    popular: 'sold DESC,created_at DESC',
  };
  const count = (await query('SELECT count(*)::int AS count FROM (' + sql + ') counted', values)).rows[0]
    .count;
  const rows = (
    await query(
      sql +
        ' ORDER BY ' +
        (sorts[url.searchParams.get('sort') || 'newest'] || sorts.newest) +
        ` LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, (page - 1) * limit],
    )
  ).rows;
  return { items: rows, total: count, page, pages: Math.ceil(count / limit) };
}
export async function product(slug: string) {
  const p = (await query(productSelect + ' WHERE p.slug=$1 AND p.visible', [slug])).rows[0];
  if (!p) fail(404, 'Product not found.');
  const [variants, images, reviews] = await Promise.all([
    query(
      `SELECT v.*,GREATEST(0,i.quantity-COALESCE((SELECT sum(oi.quantity) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.variant_id=v.id AND o.stock_state='reserved' AND o.reserved_until>now()),0))::int AS stock FROM product_variants v JOIN inventory i ON i.variant_id=v.id WHERE v.product_id=$1 AND v.active ORDER BY v.name`,
      [p.id],
    ),
    query('SELECT * FROM product_images WHERE product_id=$1 ORDER BY position', [p.id]),
    query(
      `SELECT r.id,r.rating,r.body,r.created_at,split_part(u.name,' ',1) AS name FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.product_id=$1 AND r.status='approved' ORDER BY r.created_at DESC LIMIT 50`,
      [p.id],
    ),
  ]);
  return { ...p, variants: variants.rows, images: images.rows, reviews: reviews.rows };
}

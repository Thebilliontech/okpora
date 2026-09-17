import { query } from '../../server/db';
import { config } from '../../server/config/index';
import { escapeHtml } from '../../server/http';
export default async () => {
  try {
    const products = (await query('SELECT slug FROM products WHERE visible LIMIT 40000')).rows;
    const paths = ['/', '/shop', '/about', '/contact', '/faq', ...products.map((p) => '/products/' + p.slug)];
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
        paths.map((p) => `<url><loc>${escapeHtml(config.siteUrl + p)}</loc></url>`).join('') +
        '</urlset>',
      { headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public,max-age=3600' } },
    );
  } catch {
    return new Response('Sitemap unavailable', { status: 503 });
  }
};

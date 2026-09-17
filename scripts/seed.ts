import { tx, close } from '../server/db';
export async function seed(publishSamples = false) {
  await tx(async (db) => {
    const cats: Record<string, string> = {};
    for (const [name, slug, position] of [
      ['Fashion', 'fashion', 0],
      ['Accessories', 'accessories', 1],
      ['Home & living', 'home', 2],
      ['Beauty', 'beauty', 3],
      ['Technology', 'technology', 4],
      ['Everyday essentials', 'essentials', 5],
    ] as const) {
      cats[slug] = (
        await db.query(
          'INSERT INTO categories(name,slug,position) VALUES($1,$2,$3) ON CONFLICT(slug) DO UPDATE SET name=$1 RETURNING id',
          [name, slug, position],
        )
      ).rows[0].id;
    }
    const samples = [
      {
        name: 'The everyday woven tote',
        slug: 'everyday-woven-tote',
        sku: 'SAMPLE-BAG-01',
        price: 4200000,
        compare: 5000000,
        image: '/tote.jpg',
        category: 'accessories',
        description:
          'SAMPLE PRODUCT — replace with your actual product details before publishing. A woven tote with a chain handle. Photography is illustrative.',
      },
      {
        name: 'The sculptural ceramic trio',
        slug: 'sculptural-ceramic-trio',
        sku: 'SAMPLE-HOME-01',
        price: 2850000,
        compare: null,
        image: '/hero.jpg',
        category: 'home',
        description:
          'SAMPLE PRODUCT — replace with your actual product details before publishing. Three sculptural ceramic vessels. Photography is illustrative.',
      },
      {
        name: 'The collected vase edit',
        slug: 'collected-vase-edit',
        sku: 'SAMPLE-HOME-02',
        price: 3650000,
        compare: null,
        image: '/ceramics.jpg',
        category: 'home',
        description:
          'SAMPLE PRODUCT — replace with your actual product details before publishing. A collection of textured neutral vessels. Photography is illustrative.',
      },
    ];
    for (const p of samples) {
      const exists = (await db.query('SELECT id FROM products WHERE sku=$1', [p.sku])).rows[0];
      if (exists) continue;
      const product = (
        await db.query(
          'INSERT INTO products(name,slug,sku,description,price,compare_price,image,featured,new_arrival,visible) VALUES($1,$2,$3,$4,$5,$6,$7,true,true,$8) RETURNING id',
          [p.name, p.slug, p.sku, p.description, p.price, p.compare, p.image, publishSamples],
        )
      ).rows[0];
      await db.query('INSERT INTO product_categories VALUES($1,$2)', [product.id, cats[p.category]]);
      const variant = (
        await db.query('INSERT INTO product_variants(product_id,sku,name) VALUES($1,$2,$3) RETURNING id', [
          product.id,
          p.sku + '-STD',
          'Standard',
        ])
      ).rows[0];
      await db.query('INSERT INTO inventory(variant_id,quantity) VALUES($1,$2)', [
        variant.id,
        publishSamples ? 25 : 0,
      ]);
    }
    await db.query(
      `UPDATE site_settings SET value=jsonb_set(value,'{hero_image}','"/hero.jpg"') WHERE key='store' AND value->>'hero_image'=''`,
    );
  });
}
if (process.argv[1]?.endsWith('seed.ts')) {
  await seed(process.argv.includes('--publish-samples'));
  console.log('Categories and sample draft products created. Review and replace samples before publishing.');
  await close();
}

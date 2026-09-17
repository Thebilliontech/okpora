import { useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useStore } from '../contexts/StoreContext';
import { Loading, ErrorBox, Empty, PageTitle, Pager, Field } from '../components/UI';
import ProductCard from '../components/ProductCard';
import { track } from '../services/analytics';
export default function Shop() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const { categories } = useStore();
  const [filters, setFilters] = useState(false);
  const q = new URLSearchParams(params);
  if (slug) q.set('category', slug);
  const { data, loading, error, reload } = useApi('/products?' + q);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };
  useEffect(() => {
    if (params.get('q')) track('Search', { search_term: params.get('q') });
  }, [params.get('q')]);
  const category = categories.find((c: any) => c.slug === slug);
  return (
    <div className="container">
      <PageTitle
        eyebrow="THE OKPORA COLLECTION"
        title={
          params.get('q')
            ? `Results for “${params.get('q')}”`
            : category?.name || 'Find your everyday favourite.'
        }
      />
      <div className="shop-toolbar">
        <button className="text-button" onClick={() => setFilters(!filters)}>
          <SlidersHorizontal size={18} /> {filters ? 'Hide filters' : 'Filter collection'}
        </button>
        <span>{data?.total ?? '—'} pieces</span>
        <select
          aria-label="Sort products"
          value={params.get('sort') || 'newest'}
          onChange={(e) => update('sort', e.target.value)}
        >
          {[
            ['newest', 'Newest first'],
            ['popular', 'Most popular'],
            ['price_asc', 'Price: low to high'],
            ['price_desc', 'Price: high to low'],
            ['rating', 'Highest rated'],
          ].map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className={'shop-layout ' + (filters ? 'with-filters' : '')}>
        {filters && (
          <aside className="filters">
            <h3>Refine your collection</h3>
            <Field label="Search">
              <input defaultValue={params.get('q') || ''} onBlur={(e) => update('q', e.target.value)} />
            </Field>
            {!slug && (
              <Field label="Category">
                <select
                  value={params.get('category') || ''}
                  onChange={(e) => update('category', e.target.value)}
                >
                  <option value="">All categories</option>
                  {categories.map((c: any) => (
                    <option key={c.id} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <div className="two-col">
              {['min', 'max'].map((k) => (
                <Field key={k} label={k === 'min' ? 'Min price' : 'Max price'}>
                  <input
                    type="number"
                    min="0"
                    defaultValue={params.has(k) ? Number(params.get(k)) / 100 : ''}
                    onBlur={(e) =>
                      update(k, e.target.value ? String(Math.round(Number(e.target.value) * 100)) : '')
                    }
                  />
                </Field>
              ))}
            </div>
            {['brand', 'size', 'color', 'attribute'].map((k) => (
              <Field key={k} label={k.charAt(0).toUpperCase() + k.slice(1)}>
                <input defaultValue={params.get(k) || ''} onBlur={(e) => update(k, e.target.value)} />
              </Field>
            ))}
            <Field label="Minimum rating">
              <select value={params.get('rating') || ''} onChange={(e) => update('rating', e.target.value)}>
                <option value="">All ratings</option>
                {[4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n}+ stars
                  </option>
                ))}
              </select>
            </Field>
            <label className="check">
              <input
                type="checkbox"
                checked={params.get('stock') === 'true'}
                onChange={(e) => update('stock', e.target.checked ? 'true' : '')}
              />
              In stock only
            </label>
            <button className="text-button" onClick={() => setParams({})}>
              Clear filters
            </button>
          </aside>
        )}
        <div>
          {loading ? (
            <Loading />
          ) : error ? (
            <ErrorBox message={error} retry={reload} />
          ) : data?.items.length ? (
            <>
              <div className="product-grid">
                {data.items.map((p: any) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
              <Pager page={data.page} pages={data.pages} onChange={(p) => update('page', String(p))} />
            </>
          ) : (
            <Empty title="No pieces found" text="Try a different search or clear your filters." />
          )}
        </div>
      </div>
    </div>
  );
}

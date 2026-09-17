import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { useStore } from '../contexts/StoreContext';
import { api } from '../services/api';
import { slugify } from '../utilities/format';
import { PageTitle, Field, Loading, ErrorBox } from '../components/UI';
const blankVariant = () => ({
  sku: '',
  name: 'Standard',
  size: '',
  color: '',
  price: null,
  quantity: 0,
  low_stock_threshold: 5,
  active: true,
});
const blank = {
  name: '',
  slug: '',
  sku: '',
  brand: '',
  description: '',
  price: 0,
  compare_price: null as number | null,
  image: '',
  images: [] as string[],
  category_ids: [] as string[],
  attributes: {} as Record<string, string>,
  variants: [blankVariant()],
  featured: false,
  new_arrival: false,
  visible: false,
};
export default function ProductEditor() {
  const { id } = useParams(),
    navigate = useNavigate();
  const isNew = id === 'new';
  const { categories, notify } = useStore();
  const { data, loading, error } = useApi(isNew ? null : '/admin/products/' + id);
  const [p, setP] = useState<any>(blank),
    [busy, setBusy] = useState(false),
    [attributes, setAttributes] = useState('');
  useEffect(() => {
    if (data) {
      setP(data);
      setAttributes(
        Object.entries(data.attributes)
          .map(([k, v]) => k + ': ' + v)
          .join('\n'),
      );
    } else if (isNew) {
      setP({ ...blank, variants: [blankVariant()] });
      setAttributes('');
    }
  }, [data, isNew]);
  if (loading && !isNew) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  const change = (k: string, v: any) => setP({ ...p, [k]: v });
  const variant = (index: number, k: string, v: any) =>
    setP({ ...p, variants: p.variants.map((x: any, i: number) => (i === index ? { ...x, [k]: v } : x)) });
  const upload = async (file: File) => {
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1200 / bitmap.width);
      canvas.width = bitmap.width * scale;
      canvas.height = bitmap.height * scale;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/webp', 0.75).split(',')[1];
      bitmap.close();
      if (base64.length > 180000)
        throw new Error(
          'Please use a smaller image (roughly 130 KB after compression), or an HTTPS image URL.',
        );
      const r = await api('/admin/upload', {
        method: 'POST',
        body: { name: file.name, type: 'image/webp', data: base64 },
      });
      change('image', r.url);
      notify('Image uploaded.');
    } catch (e: any) {
      notify(e.message);
    }
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const attrs = Object.fromEntries(
        attributes
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const i = line.indexOf(':');
            if (i < 1) throw new Error('Use “Attribute: value” on each line.');
            return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
          }),
      );
      await api('/admin/products' + (isNew ? '' : '/' + id), {
        method: isNew ? 'POST' : 'PUT',
        body: { ...p, attributes: attrs },
      });
      notify('Product saved.');
      navigate('/admin/products');
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageTitle eyebrow="YOUR COLLECTION" title={isNew ? 'Add a good thing.' : 'Edit product'} />
      <form onSubmit={save} className="editor-form">
        <div className="editor-main">
          <div className="panel">
            <h2>Product details</h2>
            <Field label="Product name">
              <input
                value={p.name}
                required
                onChange={(e) =>
                  setP({ ...p, name: e.target.value, ...(isNew ? { slug: slugify(e.target.value) } : {}) })
                }
              />
            </Field>
            <div className="form-grid">
              {[
                ['slug', 'URL slug'],
                ['sku', 'SKU'],
                ['brand', 'Brand'],
              ].map(([k, l]) => (
                <Field key={k} label={l}>
                  <input required={k !== 'brand'} value={p[k]} onChange={(e) => change(k, e.target.value)} />
                </Field>
              ))}
            </div>
            <Field label="Description">
              <textarea
                rows={6}
                required
                value={p.description}
                onChange={(e) => change('description', e.target.value)}
              />
            </Field>
            <div className="form-grid">
              <Field label="Price (currency units)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={p.price / 100}
                  onChange={(e) => change('price', Math.round(Number(e.target.value) * 100))}
                  required
                />
              </Field>
              <Field label="Previous price (optional)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={p.compare_price === null ? '' : p.compare_price / 100}
                  onChange={(e) =>
                    change('compare_price', e.target.value ? Math.round(Number(e.target.value) * 100) : null)
                  }
                />
              </Field>
            </div>
            <Field label="Attributes — one “Name: value” per line">
              <textarea
                value={attributes}
                onChange={(e) => setAttributes(e.target.value)}
                placeholder={'Material: Cotton\nCare: Hand wash'}
              />
            </Field>
          </div>
          <div className="panel">
            <div className="section-head">
              <h2>Variants & inventory</h2>
              <button
                type="button"
                className="text-button"
                onClick={() => change('variants', [...p.variants, blankVariant()])}
              >
                + Add variant
              </button>
            </div>
            <p className="muted">
              Use one Standard variant for products without options. Quantities are physical stock; checkout
              reservations are handled automatically.
            </p>
            {p.variants.map((v: any, index: number) => (
              <fieldset className="variant-editor" key={v.id || index}>
                <legend>Option {index + 1}</legend>
                <div className="form-grid">
                  {[
                    ['name', 'Option name'],
                    ['sku', 'Variant SKU'],
                    ['size', 'Size'],
                    ['color', 'Color'],
                  ].map(([k, l]) => (
                    <Field key={k} label={l}>
                      <input
                        required={k === 'name' || k === 'sku'}
                        value={v[k]}
                        onChange={(e) => variant(index, k, e.target.value)}
                      />
                    </Field>
                  ))}
                  <Field label="Override price (optional)">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={v.price === null ? '' : v.price / 100}
                      onChange={(e) =>
                        variant(
                          index,
                          'price',
                          e.target.value ? Math.round(Number(e.target.value) * 100) : null,
                        )
                      }
                    />
                  </Field>
                  <Field label="Stock quantity">
                    <input
                      type="number"
                      min="0"
                      value={v.quantity}
                      onChange={(e) => variant(index, 'quantity', Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Low-stock threshold">
                    <input
                      type="number"
                      min="0"
                      value={v.low_stock_threshold}
                      onChange={(e) => variant(index, 'low_stock_threshold', Number(e.target.value))}
                    />
                  </Field>
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={v.active}
                    onChange={(e) => variant(index, 'active', e.target.checked)}
                  />
                  Available for sale
                </label>
                {p.variants.length > 1 && (
                  <button
                    type="button"
                    className="text-button danger-text"
                    onClick={() =>
                      change(
                        'variants',
                        p.variants.filter((_: any, i: number) => i !== index),
                      )
                    }
                  >
                    Remove option
                  </button>
                )}
              </fieldset>
            ))}
          </div>
        </div>
        <aside>
          <div className="panel">
            <h3>Product image</h3>
            {p.image && <img className="editor-image" src={p.image} alt="Product preview" />}
            <Field label="Image URL">
              <input value={p.image} onChange={(e) => change('image', e.target.value)} />
            </Field>
            <Field label="Or upload an image">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  if (e.target.files?.[0]) upload(e.target.files[0]);
                }}
              />
            </Field>
            <Field label="Gallery URLs — one per line">
              <textarea
                value={p.images.join('\n')}
                onChange={(e) => change('images', e.target.value.split('\n').filter(Boolean))}
              />
            </Field>
          </div>
          <div className="panel">
            <h3>Categories</h3>
            {categories.map((c: any) => (
              <label key={c.id} className="check">
                <input
                  type="checkbox"
                  checked={p.category_ids.includes(c.id)}
                  onChange={(e) =>
                    change(
                      'category_ids',
                      e.target.checked
                        ? [...p.category_ids, c.id]
                        : p.category_ids.filter((x: string) => x !== c.id),
                    )
                  }
                />
                {c.name}
              </label>
            ))}
          </div>
          <div className="panel">
            <h3>Visibility</h3>
            {[
              ['visible', 'Published'],
              ['featured', 'Featured'],
              ['new_arrival', 'New arrival'],
            ].map(([k, l]) => (
              <label key={k} className="check">
                <input type="checkbox" checked={p[k]} onChange={(e) => change(k, e.target.checked)} />
                {l}
              </label>
            ))}
            <button className="button full" disabled={busy}>
              {busy ? 'Saving…' : 'Save product'}
            </button>
            <button type="button" className="text-button" onClick={() => navigate('/admin/products')}>
              Cancel
            </button>
          </div>
        </aside>
      </form>
    </>
  );
}

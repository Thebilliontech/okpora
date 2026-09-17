import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Heart, Truck, ShieldCheck, Plus, Minus, Star, ZoomIn } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useStore } from '../contexts/StoreContext';
import { Loading, ErrorBox, Field, Modal } from '../components/UI';
import { money } from '../utilities/format';
import { api } from '../services/api';
import ProductCard from '../components/ProductCard';
import { track } from '../services/analytics';
function Related({ category, id }: { category?: string; id: string }) {
  const { data } = useApi('/products?limit=5' + (category ? '&category=' + category : ''));
  return data?.items?.length > 1 ? (
    <section className="product-section">
      <h2>A few more good things.</h2>
      <div className="product-grid">
        {data.items
          .filter((p: any) => p.id !== id)
          .slice(0, 4)
          .map((p: any) => (
            <ProductCard product={p} key={p.id} />
          ))}
      </div>
    </section>
  ) : null;
}
export default function Product() {
  const { slug } = useParams();
  const { data: p, loading, error, reload } = useApi('/products/' + slug);
  const { store, add, toggleWishlist, notify, user } = useStore(),
    navigate = useNavigate();
  const [variant, setVariant] = useState(''),
    [qty, setQty] = useState(1),
    [image, setImage] = useState(''),
    [zoom, setZoom] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (p) {
      setVariant(p.variants[0]?.id || '');
      setImage(p.image);
      setQty(1);
      document.title = p.name + ' | ' + store.name;
      track('ViewContent', { content_ids: [p.id], value: p.price / 100, currency: store.currency });
      const node = document.createElement('script');
      node.type = 'application/ld+json';
      node.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: p.name,
        image: p.image,
        description: p.description,
        sku: p.sku,
        offers: {
          '@type': 'Offer',
          price: p.price / 100,
          priceCurrency: store.currency,
          availability: 'https://schema.org/' + (p.stock ? 'InStock' : 'OutOfStock'),
        },
      }).replaceAll('<', '\\u003c');
      document.head.append(node);
      return () => node.remove();
    }
  }, [p]);
  if (loading)
    return (
      <div className="container">
        <Loading />
      </div>
    );
  if (error)
    return (
      <div className="container">
        <ErrorBox message={error} retry={reload} />
      </div>
    );
  if (!p) return null;
  const v = p.variants.find((x: any) => x.id === variant);
  const addToBag = async (buy = false) => {
    setBusy(true);
    try {
      await add(p, v, qty);
      if (buy) navigate('/checkout');
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="container">
      <div className="breadcrumbs">
        <Link to="/shop">The collection</Link>
        <span>/</span>
        {p.name}
      </div>
      <div className="product-detail">
        <div>
          <button className="detail-image" onClick={() => setZoom(true)} aria-label="Enlarge product image">
            {image ? <img src={image} alt={p.name} /> : <div className="image-placeholder">Okpora</div>}
            <ZoomIn />
          </button>
          <div className="gallery">
            {[p.image, ...p.images.map((i: any) => i.url)].filter(Boolean).map((url: string, i: number) => (
              <button className={image === url ? 'active' : ''} onClick={() => setImage(url)} key={i}>
                <img src={url} alt={`${p.name} view ${i + 1}`} />
              </button>
            ))}
          </div>
        </div>
        <div className="detail-copy">
          <span className="eyebrow">{p.brand || p.categories[0]?.name || 'THE OKPORA EDIT'}</span>
          <h1>{p.name}</h1>
          {p.review_count > 0 && (
            <a href="#reviews" className="rating">
              <Star fill="currentColor" size={16} /> {Number(p.rating).toFixed(1)} · {p.review_count} reviews
            </a>
          )}
          <div className="detail-price">
            {money(v?.price ?? p.price, store.currency)}{' '}
            {p.compare_price > (v?.price ?? p.price) && <del>{money(p.compare_price, store.currency)}</del>}
          </div>
          <p className="product-description">{p.description}</p>
          {Object.keys(p.attributes || {}).length > 0 && (
            <dl className="attributes">
              {Object.entries(p.attributes).map(([k, value]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
            </dl>
          )}
          {p.variants.length > 1 && (
            <Field label="Choose your option">
              <select value={variant} onChange={(e) => setVariant(e.target.value)}>
                {p.variants.map((item: any) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                    {item.stock === 0 ? ' — out of stock' : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <p className={'stock ' + (v?.stock ? '' : 'out')}>
            {v?.stock ? `${v.stock} available` : 'Currently out of stock'}
          </p>
          <div className="buy-row">
            <div className="quantity">
              <button aria-label="Decrease quantity" onClick={() => setQty(Math.max(1, qty - 1))}>
                <Minus size={14} />
              </button>
              <span>{qty}</span>
              <button
                aria-label="Increase quantity"
                onClick={() => setQty(Math.min(v?.stock || 1, 99, qty + 1))}
              >
                <Plus size={14} />
              </button>
            </div>
            <button className="button" disabled={!v?.stock || busy} onClick={() => addToBag()}>
              {busy ? 'Adding…' : 'Add to bag'}
            </button>
            <button
              className="heart-outline"
              aria-label="Save to wishlist"
              onClick={() => toggleWishlist(p).catch((e: any) => notify(e.message))}
            >
              <Heart size={20} />
            </button>
          </div>
          <button
            className="button secondary full"
            disabled={!v?.stock || busy}
            onClick={() => addToBag(true)}
          >
            Buy it now
          </button>
          <div className="product-service">
            <p>
              <Truck size={19} />
              Enter your address at checkout for delivery pricing and estimates.
            </p>
            <p>
              <ShieldCheck size={19} />
              Payment is handled securely by our payment provider.
            </p>
          </div>
          <small>SKU: {v?.sku || p.sku}</small>
        </div>
      </div>
      <section id="reviews" className="reviews">
        <div className="section-head">
          <h2>From the people who chose it.</h2>
          <span>{p.review_count} verified reviews</span>
        </div>
        {p.reviews.length ? (
          p.reviews.map((r: any) => (
            <article key={r.id}>
              <b>{r.name}</b>
              <span className="review-stars">
                {'★'.repeat(r.rating)}
                {'☆'.repeat(5 - r.rating)}
              </span>
              <p>{r.body}</p>
              <small>Verified purchase</small>
            </article>
          ))
        ) : (
          <p className="muted">Be the first to share your experience after delivery.</p>
        )}
        {user && (
          <form
            className="review-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const fd = new FormData(form);
              try {
                const r = await api('/reviews', {
                  method: 'POST',
                  body: { product_id: p.id, rating: Number(fd.get('rating')), body: fd.get('body') },
                });
                notify(r.message);
                form.reset();
              } catch (e: any) {
                notify(e.message);
              }
            }}
          >
            <h3>Review your purchase</h3>
            <Field label="Rating">
              <select name="rating">
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} stars
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Your experience">
              <textarea name="body" required minLength={5} maxLength={3000} />
            </Field>
            <button className="button">Submit review</button>
          </form>
        )}
      </section>
      <Related category={p.categories[0]?.slug} id={p.id} />
      {zoom && (
        <Modal title={p.name} onClose={() => setZoom(false)}>
          <img className="zoom-image" src={image} alt={p.name} />
        </Modal>
      )}
    </div>
  );
}

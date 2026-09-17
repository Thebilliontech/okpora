import { Link, useNavigate } from 'react-router-dom';
import { Heart, Plus, Star } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../contexts/StoreContext';
import { money } from '../utilities/format';
import { api } from '../services/api';
export default function ProductCard({ product: p }: { product: any }) {
  const { store, wishlist, toggleWishlist, notify, add } = useStore(),
    navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const wish = wishlist.some((i: any) => i.id === p.id);
  const quickAdd = async () => {
    setBusy(true);
    try {
      const full = await api('/products/' + p.slug);
      if (full.variants.length !== 1) {
        navigate('/products/' + p.slug);
        return;
      }
      await add(full, full.variants[0]);
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="product-card">
      <div className="product-image">
        <Link to={'/products/' + p.slug}>
          {p.image ? (
            <img src={p.image} alt={p.name} loading="lazy" />
          ) : (
            <div className="image-placeholder">Okpora</div>
          )}
        </Link>
        <div className="product-flags">
          {p.compare_price > p.price ? (
            <span>−{Math.round((1 - p.price / p.compare_price) * 100)}%</span>
          ) : p.new_arrival ? (
            <span>NEW</span>
          ) : null}
        </div>
        <button
          className={'wishlist-button ' + (wish ? 'saved' : '')}
          aria-label={wish ? 'Remove from wishlist' : 'Add to wishlist'}
          onClick={() => toggleWishlist(p).catch((e: any) => notify(e.message))}
        >
          <Heart size={19} fill={wish ? 'currentColor' : 'none'} />
        </button>
        <button className="quick-add" disabled={busy || p.stock === 0} onClick={quickAdd}>
          <Plus size={16} />
          {busy ? 'Adding…' : p.stock === 0 ? 'Out of stock' : 'Add to bag'}
        </button>
      </div>
      <div className="product-meta">
        <span>{p.categories?.[0]?.name || p.brand || 'Okpora edit'}</span>
        {p.review_count > 0 && (
          <span>
            <Star size={12} fill="currentColor" />
            {Number(p.rating).toFixed(1)} <small>({p.review_count})</small>
          </span>
        )}
      </div>
      <Link className="product-name" to={'/products/' + p.slug}>
        {p.name}
      </Link>
      <div className="price">
        {money(p.price, store.currency)}{' '}
        {p.compare_price > p.price && <del>{money(p.compare_price, store.currency)}</del>}
      </div>
    </article>
  );
}

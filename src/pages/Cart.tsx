import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Trash2, Heart, ArrowRight } from 'lucide-react';
import { useStore } from '../contexts/StoreContext';
import { money } from '../utilities/format';
import { api } from '../services/api';
import { Empty, PageTitle, Modal, Field } from '../components/UI';
export default function Cart() {
  const { cart, store, saveCart, toggleWishlist, notify, user, cartReady, wishlist } = useStore(),
    navigate = useNavigate();
  const [edit, setEdit] = useState<any>(null),
    [variant, setVariant] = useState(''),
    [busy, setBusy] = useState(false);
  const update = (variant_id: string, quantity: number) =>
    saveCart(cart.map((i: any) => (i.variant_id === variant_id ? { ...i, quantity } : i))).catch((e: any) =>
      notify(e.message),
    );
  const openOptions = async (item: any) => {
    try {
      const p = await api('/products/' + item.slug);
      setEdit({ item, product: p });
      setVariant(item.variant_id);
    } catch (e: any) {
      notify(e.message);
    }
  };
  const changeOption = async () => {
    setBusy(true);
    try {
      const v = edit.product.variants.find((x: any) => x.id === variant);
      if (!v || v.stock < edit.item.quantity) throw new Error('This option does not have enough stock.');
      const next = cart.filter((x: any) => x.variant_id !== edit.item.variant_id).map((x: any) => ({ ...x }));
      const existing = next.find((x: any) => x.variant_id === v.id);
      if (existing) {
        if (existing.quantity + edit.item.quantity > Math.min(v.stock, 99))
          throw new Error('This quantity is not available.');
        existing.quantity += edit.item.quantity;
      } else
        next.push({ ...edit.item, variant_id: v.id, variant: v.name, price: v.price ?? edit.product.price });
      await saveCart(next);
      setEdit(null);
      notify('Your bag has been updated.');
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="container">
      <PageTitle eyebrow="YOURS, ALMOST" title="Your shopping bag" />
      {!cart.length ? (
        <Empty
          title="Your bag is waiting."
          text="Find something you love and make it yours."
          link="Explore the collection"
        />
      ) : (
        <div className="cart-layout">
          <div>
            {cart.map((i: any) => (
              <article className="cart-item" key={i.variant_id}>
                <Link to={'/products/' + i.slug}>{i.image && <img src={i.image} alt={i.name} />}</Link>
                <div>
                  <Link className="product-name" to={'/products/' + i.slug}>
                    {i.name}
                  </Link>
                  <p className="muted">{i.variant}</p>
                  <div className="cart-item-actions">
                    <button
                      disabled={!cartReady}
                      onClick={() =>
                        saveCart(cart.filter((x: any) => x.variant_id !== i.variant_id)).catch((e: any) =>
                          notify(e.message),
                        )
                      }
                    >
                      <Trash2 size={14} />
                      Remove
                    </button>
                    <button
                      disabled={!cartReady}
                      onClick={async () => {
                        try {
                          if (!user) {
                            navigate('/login?next=/cart');
                            return;
                          }
                          if (!wishlist.some((p: any) => p.id === i.product_id))
                            await toggleWishlist({
                              id: i.product_id,
                              name: i.name,
                              slug: i.slug,
                              image: i.image,
                              price: i.price,
                            });
                          await saveCart(cart.filter((x: any) => x.variant_id !== i.variant_id));
                        } catch (e: any) {
                          notify(e.message);
                        }
                      }}
                    >
                      <Heart size={14} />
                      Save for later
                    </button>
                  </div>
                  <button className="text-button" onClick={() => openOptions(i)}>
                    Change option
                  </button>
                </div>
                <div>
                  <input
                    aria-label={'Quantity for ' + i.name}
                    type="number"
                    min={1}
                    max={99}
                    value={i.quantity}
                    disabled={!cartReady}
                    onChange={(e) =>
                      update(i.variant_id, Math.max(1, Math.min(99, Number(e.target.value) || 1)))
                    }
                  />
                  <b>{money(i.price * i.quantity, store.currency)}</b>
                </div>
              </article>
            ))}
            <Link className="underlined" to="/shop">
              Continue discovering <ArrowRight size={17} />
            </Link>
          </div>
          <aside className="order-summary">
            <h2>The details</h2>
            <div>
              <span>Subtotal</span>
              <b>
                {money(
                  cart.reduce((s: number, i: any) => s + i.price * i.quantity, 0),
                  store.currency,
                )}
              </b>
            </div>
            <div>
              <span>Delivery & taxes</span>
              <span>At checkout</span>
            </div>
            <p className="muted">
              Apply a coupon at checkout. Prices and stock are confirmed before payment.
            </p>
            <Link className="button full" to="/checkout">
              Continue to checkout <ArrowRight size={17} />
            </Link>
            <small>Secure payment. A little peace of mind.</small>
          </aside>
        </div>
      )}
      {edit && (
        <Modal title="Choose your option" onClose={() => setEdit(null)}>
          <h3>{edit.product.name}</h3>
          <Field label="Available options">
            <select value={variant} onChange={(e) => setVariant(e.target.value)}>
              {edit.product.variants.map((v: any) => (
                <option key={v.id} value={v.id} disabled={!v.stock}>
                  {v.name} — {money(v.price ?? edit.product.price, store.currency)}{' '}
                  {v.stock ? '' : '(out of stock)'}
                </option>
              ))}
            </select>
          </Field>
          <button className="button" disabled={busy || !cartReady} onClick={changeOption}>
            {busy ? 'Updating…' : 'Update bag'}
          </button>
        </Modal>
      )}
    </div>
  );
}

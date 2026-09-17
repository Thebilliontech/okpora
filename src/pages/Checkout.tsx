import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { LockKeyhole, ArrowRight, Check } from 'lucide-react';
import { useStore } from '../contexts/StoreContext';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import { money } from '../utilities/format';
import { Field, PageTitle, ErrorBox, Loading, Empty } from '../components/UI';
import { track } from '../services/analytics';
export default function Checkout() {
  const { user, authLoading, cart, store } = useStore();
  const { data: addresses } = useApi(user ? '/addresses' : null);
  const [step, setStep] = useState(1),
    [address, setAddress] = useState<any>({
      full_name: '',
      email: '',
      phone: '',
      country: 'Nigeria',
      region: '',
      city: '',
      address: '',
      instructions: '',
    }),
    [coupon, setCoupon] = useState(''),
    [quote, setQuote] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saveAddress, setSaveAddress] = useState(false),
    [key, setKey] = useState(crypto.randomUUID());
  if (authLoading) return <Loading />;
  if (!user) return <Navigate to="/login?next=/checkout" replace />;
  if (!cart.length)
    return (
      <div className="container">
        <Empty title="Your bag is empty" link="Explore the collection" />
      </div>
    );
  const payload = () => ({
    items: cart.map((i: any) => ({ variant_id: i.variant_id, quantity: i.quantity })),
    address: {
      ...address,
      full_name: address.full_name || user.name,
      email: address.email || user.email,
      phone: address.phone || user.phone,
    },
    coupon,
    checkout_key: key,
  });
  const review = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const input = payload();
      const q = await api('/checkout/quote', { method: 'POST', body: input });
      setAddress(input.address);
      setQuote(q);
      setStep(2);
      track('InitiateCheckout', { value: q.total / 100, currency: q.currency });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const pay = async () => {
    setBusy(true);
    setError('');
    try {
      if (saveAddress) {
        await api('/addresses', { method: 'POST', body: { label: 'Home', details: payload().address } });
        setSaveAddress(false);
      }
      const result = await api('/checkout', {
        method: 'POST',
        body: { ...payload(), reviewed_total: quote.total, reviewed_currency: quote.currency },
      });
      window.location.assign(result.url);
    } catch (e: any) {
      setError(e.message);
      if (e.status === 409) {
        setKey(crypto.randomUUID());
        setStep(1);
      }
      setBusy(false);
    }
  };
  return (
    <div className="container">
      <PageTitle eyebrow="ONE STEP CLOSER" title="Make it yours." />
      <div className="checkout-steps">
        <span className="done">
          <Check size={15} /> Bag
        </span>
        <span className="active">1. Delivery</span>
        <span className={step === 2 ? 'active' : ''}>2. Review</span>
        <span>3. Secure payment</span>
      </div>
      {error && <ErrorBox message={error} />}
      <div className="checkout-layout">
        <section>
          {step === 1 ? (
            <form onSubmit={review}>
              <h2>Where should we send it?</h2>
              {addresses?.length > 0 && (
                <Field label="Use a saved address">
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const a = addresses.find((a: any) => a.id === e.target.value);
                      if (a) setAddress(a.details);
                    }}
                  >
                    <option value="">Enter a new address</option>
                    {addresses.map((a: any) => (
                      <option key={a.id} value={a.id}>
                        {a.label} — {a.details.address}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <div className="form-grid">
                {[
                  ['full_name', 'Full name'],
                  ['email', 'Email address'],
                  ['phone', 'Phone number'],
                  ['country', 'Country'],
                  ['region', 'State / region'],
                  ['city', 'City'],
                ].map(([key, label]) => (
                  <Field key={key} label={label}>
                    <input
                      required
                      type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
                      autoComplete={
                        key === 'full_name'
                          ? 'name'
                          : key === 'region'
                            ? 'address-level1'
                            : key === 'city'
                              ? 'address-level2'
                              : key === 'country'
                                ? 'country-name'
                                : key === 'phone'
                                  ? 'tel'
                                  : key
                      }
                      value={
                        address[key] ||
                        (['full_name', 'email', 'phone'].includes(key)
                          ? user[key === 'full_name' ? 'name' : key] || ''
                          : '')
                      }
                      onChange={(e) => setAddress({ ...address, [key]: e.target.value })}
                    />
                  </Field>
                ))}
              </div>
              <Field label="Street address">
                <input
                  required
                  minLength={5}
                  autoComplete="street-address"
                  value={address.address}
                  onChange={(e) => setAddress({ ...address, address: e.target.value })}
                />
              </Field>
              <Field label="Delivery instructions (optional)">
                <textarea
                  value={address.instructions}
                  onChange={(e) => setAddress({ ...address, instructions: e.target.value })}
                />
              </Field>
              <label className="check">
                <input
                  type="checkbox"
                  checked={saveAddress}
                  onChange={(e) => setSaveAddress(e.target.checked)}
                />
                Save this address for next time
              </label>
              <Field label="Coupon code (optional)">
                <input
                  value={coupon}
                  onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                  placeholder="Your code"
                />
              </Field>
              <button className="button" disabled={busy}>
                {busy ? 'Checking your order…' : 'Review order'}
                <ArrowRight size={17} />
              </button>
            </form>
          ) : (
            <>
              <div className="section-head">
                <h2>Looking good?</h2>
                <button
                  className="text-button"
                  onClick={() => {
                    setStep(1);
                    setKey(crypto.randomUUID());
                  }}
                >
                  Edit details
                </button>
              </div>
              <div className="panel">
                <h3>Delivering to</h3>
                <p>
                  {address.full_name}
                  <br />
                  {address.address}
                  <br />
                  {address.city}, {address.region}
                  <br />
                  {address.country}
                </p>
                <p>
                  {address.email}
                  <br />
                  {address.phone}
                </p>
                <b>
                  Estimated delivery: {quote.min_days}–{quote.max_days} business days
                </b>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  pay();
                }}
              >
                <label className="check">
                  <input type="checkbox" required />I agree to the{' '}
                  <Link to="/policies/terms" target="_blank">
                    terms
                  </Link>{' '}
                  and have read the{' '}
                  <Link to="/policies/privacy" target="_blank">
                    privacy policy
                  </Link>
                  .
                </label>
                <button className="button full" disabled={busy}>
                  <LockKeyhole size={18} />
                  {busy ? 'Opening secure payment…' : `Pay ${money(quote.total, quote.currency)}`}
                </button>
                <p className="muted">
                  You’ll continue to our payment provider. Your order is confirmed after the payment has been
                  verified.
                </p>
              </form>
            </>
          )}
        </section>
        <aside className="order-summary">
          <h2>In your bag</h2>
          {cart.map((i: any) => (
            <div className="summary-item" key={i.variant_id}>
              {i.image && <img src={i.image} alt="" />}
              <span>
                {i.name}
                <small>
                  {i.variant} · Qty {i.quantity}
                </small>
              </span>
              <b>
                {money(
                  (quote?.items.find((p: any) => p.variant_id === i.variant_id)?.price ?? i.price) *
                    i.quantity,
                  quote?.currency || store.currency,
                )}
              </b>
            </div>
          ))}
          <div>
            <span>Subtotal</span>
            <b>
              {money(
                quote?.subtotal ?? cart.reduce((s: number, i: any) => s + i.price * i.quantity, 0),
                store.currency,
              )}
            </b>
          </div>
          {quote && (
            <>
              <div>
                <span>Discount</span>
                <span>−{money(quote.discount, quote.currency)}</span>
              </div>
              <div>
                <span>Delivery</span>
                <span>{money(quote.delivery_fee, quote.currency)}</span>
              </div>
              <div>
                <span>Tax</span>
                <span>{money(quote.tax, quote.currency)}</span>
              </div>
              <div className="summary-total">
                <span>Total</span>
                <b>{money(quote.total, quote.currency)}</b>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

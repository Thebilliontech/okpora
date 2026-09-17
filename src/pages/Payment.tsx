import { useEffect, useState } from 'react';
import { Link, useSearchParams, useLocation, Navigate } from 'react-router-dom';
import { CheckCircle2, Clock3 } from 'lucide-react';
import { api } from '../services/api';
import { useStore } from '../contexts/StoreContext';
import { purchase } from '../services/analytics';
import { Loading, ErrorBox } from '../components/UI';
export default function Payment() {
  const [params] = useSearchParams(),
    location = useLocation();
  const { user, authLoading, saveCart, cartReady, cart } = useStore();
  const [order, setOrder] = useState<any>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(true),
    [attempt, setAttempt] = useState(0);
  const cancelled = location.pathname.endsWith('cancelled');
  useEffect(() => {
    if (!user || !cartReady || cancelled) return;
    let active = true,
      t: ReturnType<typeof setTimeout>;
    let n = 0;
    setBusy(true);
    const check = async () => {
      try {
        const o = await api('/payments/verify', { method: 'POST', body: { order_id: params.get('order') } });
        if (!active) return;
        setOrder(o);
        purchase(o);
        const clearedKey = 'okpora_cleared_' + o.id;
        if (!localStorage.getItem(clearedKey)) {
          const remaining = cart
            .map((i: any) => ({
              ...i,
              quantity: i.quantity - (o.items.find((x: any) => x.variant_id === i.variant_id)?.quantity || 0),
            }))
            .filter((i: any) => i.quantity > 0);
          await saveCart(remaining);
          localStorage.setItem(clearedKey, '1');
        }
        setBusy(false);
        setError('');
      } catch (e: any) {
        if (!active) return;
        if (e.status === 409 && n++ < 5) {
          t = setTimeout(check, 2500);
        } else {
          setError(e.message);
          setBusy(false);
        }
      }
    };
    check();
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [user?.id, cartReady, attempt, cancelled]);
  if (authLoading) return <Loading />;
  if (!user)
    return <Navigate to={'/login?next=' + encodeURIComponent(location.pathname + location.search)} replace />;
  return (
    <div className="payment-result container">
      {cancelled ? (
        <>
          <Clock3 size={52} />
          <h1>Payment wasn’t completed.</h1>
          <p>No payment is confirmed yet. If you were debited, check your order before trying again.</p>
          <Link className="button" to={'/order/' + params.get('order')}>
            View order status
          </Link>
          <Link className="text-button" to="/checkout">
            Return to checkout
          </Link>
        </>
      ) : busy ? (
        <>
          <div className="spinner" />
          <h1>Confirming your payment.</h1>
          <p>This usually takes a few moments.</p>
        </>
      ) : order ? (
        <>
          <CheckCircle2 size={60} />
          <span className="eyebrow">PAYMENT CONFIRMED</span>
          <h1>{order.status === 'cancelled' ? 'Payment received.' : 'Good things are on their way.'}</h1>
          <p>Thank you for shopping with Okpora.</p>
          <b>{order.number}</b>
          {order.status === 'cancelled' && (
            <p>Our team is reviewing this order and will contact you about fulfilment or a refund.</p>
          )}
          <p>Your delivery details and latest updates are in your account.</p>
          <Link className="button" to={'/order/' + order.number}>
            View your order
          </Link>
        </>
      ) : (
        <>
          <Clock3 size={52} />
          <h1>We’re still checking.</h1>
          <ErrorBox message={error} />
          <p>If you have paid, please wait before starting another payment.</p>
          <button className="button" onClick={() => setAttempt((a) => a + 1)}>
            Check again
          </button>
          <Link className="text-button" to="/account/orders">
            Go to my orders
          </Link>
        </>
      )}
    </div>
  );
}

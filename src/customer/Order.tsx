import { useParams, Navigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useStore } from '../contexts/StoreContext';
import { Loading, ErrorBox, PageTitle, Badge } from '../components/UI';
import { money, date, label } from '../utilities/format';
export default function Order() {
  const { id } = useParams();
  const { user, authLoading } = useStore();
  const { data: o, error, loading, reload } = useApi(user ? '/orders/' + id : null);
  if (authLoading) return <Loading />;
  if (!user) return <Navigate to={'/login?next=' + encodeURIComponent('/order/' + id)} replace />;
  if (error)
    return (
      <div className="container">
        <ErrorBox message={error} retry={reload} />
      </div>
    );
  if (loading || !o) return <Loading />;
  const stages = ['paid', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
  return (
    <div className="container">
      <PageTitle eyebrow={'PLACED ' + date(o.created_at).toUpperCase()} title={o.number} />
      <div className="order-head">
        <Badge status={o.status} />
        <Badge status={o.payment_status} />
        <button className="text-button" onClick={reload}>
          Refresh updates
        </button>
      </div>
      <div className="checkout-layout">
        <div>
          <div className="panel">
            <h2>Your order’s journey</h2>
            {!['cancelled', 'refunded'].includes(o.status) && (
              <div className="timeline">
                {stages.map((s, i) => (
                  <div className={stages.indexOf(o.status) >= i ? 'completed' : ''} key={s}>
                    <span>{stages.indexOf(o.status) >= i ? <Check size={13} /> : i + 1}</span>
                    <b>{label(s)}</b>
                  </div>
                ))}
              </div>
            )}
            {o.history.map((h: any) => (
              <div className="history-event" key={h.id}>
                <b>{label(h.status)}</b>
                <small>{new Date(h.created_at).toLocaleString()}</small>
                {h.note && <p>{h.note}</p>}
              </div>
            ))}
          </div>
          <div className="panel">
            <h2>Delivery details</h2>
            <p>
              {o.address.full_name}
              <br />
              {o.address.address}
              <br />
              {o.address.city}, {o.address.region}
              <br />
              {o.address.country}
            </p>
            <p>
              Estimated delivery:{' '}
              <b>
                {o.min_days}–{o.max_days} business days
              </b>{' '}
              after payment.
            </p>
            {o.shipment?.tracking_number && (
              <p>
                {o.shipment.courier} · {o.shipment.tracking_number}
              </p>
            )}
            {o.shipment?.tracking_url && (
              <a className="underlined" href={o.shipment.tracking_url} target="_blank" rel="noreferrer">
                Track with courier ↗
              </a>
            )}
          </div>
        </div>
        <aside className="order-summary">
          <h2>Your pieces</h2>
          {o.items.map((i: any) => (
            <div className="summary-item" key={i.id}>
              {i.image && <img src={i.image} alt="" />}
              <span>
                {i.name}
                <small>
                  {i.variant} × {i.quantity}
                </small>
              </span>
              <b>{money(i.price * i.quantity, o.currency)}</b>
            </div>
          ))}
          {[
            ['Subtotal', o.subtotal],
            ['Discount', -o.discount],
            ['Delivery', o.delivery_fee],
            ['Tax', o.tax],
            ['Total', o.total],
          ].map(([k, v]) => (
            <div key={k}>
              <span>{k}</span>
              <b>{money(v, o.currency)}</b>
            </div>
          ))}
          <small>Payment reference: {o.payment_reference}</small>
        </aside>
      </div>
    </div>
  );
}

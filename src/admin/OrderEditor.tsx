import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { useStore } from '../contexts/StoreContext';
import { api } from '../services/api';
import { PageTitle, Loading, ErrorBox, Badge, Field, Modal } from '../components/UI';
import { money, date, label } from '../utilities/format';
const transitions: Record<string, string[]> = {
  paid: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery', 'delivered'],
  out_for_delivery: ['delivered'],
  pending_payment: ['cancelled'],
};
export default function OrderEditor() {
  const { id } = useParams();
  const { data: o, loading, error, reload } = useApi('/admin/orders/' + id);
  const { user, notify } = useStore();
  const [busy, setBusy] = useState(false),
    [refund, setRefund] = useState(false);
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} retry={reload} />;
  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api('/admin/orders/' + o.id, {
        method: 'PATCH',
        body: {
          status: fd.get('status'),
          min_days: Number(fd.get('min_days')),
          max_days: Number(fd.get('max_days')),
          courier: fd.get('courier'),
          tracking_number: fd.get('tracking_number'),
          tracking_url: fd.get('tracking_url'),
          admin_note: fd.get('admin_note'),
        },
      });
      notify('Order updated.');
      reload();
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="section-head">
        <PageTitle eyebrow={'ORDER · ' + date(o.created_at)} title={o.number} />
        <Link className="button secondary" to="/admin/orders">
          Back to orders
        </Link>
      </div>
      <div className="order-head">
        <Badge status={o.status} />
        <Badge status={o.payment_status} />
        <strong>{money(o.total, o.currency)}</strong>
      </div>
      <div className="editor-form">
        <div>
          <div className="panel">
            <h2>Purchased items</h2>
            {o.items.map((i: any) => (
              <div className="summary-item" key={i.id}>
                {i.image && <img src={i.image} alt="" />}
                <span>
                  <b>{i.name}</b>
                  <small>
                    {i.variant} · {i.sku} · Qty {i.quantity}
                  </small>
                </span>
                <b>{money(i.price * i.quantity, o.currency)}</b>
              </div>
            ))}
          </div>
          <div className="panel">
            <h2>Customer & delivery</h2>
            <p>
              <b>{o.address.full_name}</b>
              <br />
              {o.address.email}
              <br />
              {o.address.phone}
            </p>
            <p>
              {o.address.address}
              <br />
              {o.address.city}, {o.address.region}
              <br />
              {o.address.country}
            </p>
            {o.address.instructions && <p>Instructions: {o.address.instructions}</p>}
          </div>
          <div className="panel">
            <h2>Payment details</h2>
            <dl className="attributes">
              {[
                ['Provider', o.provider],
                ['Reference', o.payment_reference],
                ['Paid at', o.paid_at ? new Date(o.paid_at).toLocaleString() : 'Awaiting payment'],
                ['Subtotal', money(o.subtotal, o.currency)],
                ['Discount', money(o.discount, o.currency)],
                ['Delivery', money(o.delivery_fee, o.currency)],
                ['Tax', money(o.tax, o.currency)],
                ['Total', money(o.total, o.currency)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {user.role === 'super_admin' && o.payment_status === 'paid' && (
              <button className="button secondary" onClick={() => setRefund(true)}>
                Issue full refund
              </button>
            )}
            {o.payment_status === 'refund_pending' && (
              <>
                <p>
                  Refund verification is pending. If the provider response was lost, look up the refund in
                  your gateway dashboard and enter its ID below.
                </p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    try {
                      await api('/admin/refund-reconcile/' + o.id, {
                        method: 'POST',
                        body: { provider_ref: fd.get('reference') },
                      });
                      notify('Refund ID saved for provider verification.');
                    } catch (e: any) {
                      notify(e.message);
                    }
                  }}
                >
                  <Field label="Provider refund ID">
                    <input name="reference" required />
                  </Field>
                  <button className="button secondary">Reconcile refund</button>
                </form>
              </>
            )}
          </div>
          <div className="panel">
            <h2>Order timeline</h2>
            {o.history.map((h: any) => (
              <div className="history-event" key={h.id}>
                <b>{label(h.status)}</b>
                <small>{new Date(h.created_at).toLocaleString()}</small>
                <p>{h.note}</p>
              </div>
            ))}
          </div>
        </div>
        <aside>
          <form className="panel" onSubmit={save} key={o.updated_at}>
            <h2>Fulfilment</h2>
            <Field label="Order status">
              <select name="status" defaultValue={o.status}>
                {[o.status, ...(transitions[o.status] || [])].map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Minimum days">
                <input name="min_days" type="number" min="0" max="365" defaultValue={o.min_days} />
              </Field>
              <Field label="Maximum days">
                <input name="max_days" type="number" min="0" max="365" defaultValue={o.max_days} />
              </Field>
            </div>
            {[
              ['courier', 'Courier'],
              ['tracking_number', 'Tracking number'],
              ['tracking_url', 'Tracking URL'],
            ].map(([k, l]) => (
              <Field key={k} label={l}>
                <input name={k} defaultValue={o.shipment?.[k] || ''} />
              </Field>
            ))}
            <Field label="Private admin note">
              <textarea name="admin_note" />
            </Field>
            <button className="button full" disabled={busy}>
              {busy ? 'Saving…' : 'Update order'}
            </button>
            <p className="muted">
              Status changes notify the customer. Cancellation and refunds are separate actions.
            </p>
          </form>
          <div className="panel">
            <h3>Private notes</h3>
            {o.notes.length ? (
              o.notes.map((n: any) => (
                <div className="history-event" key={n.id}>
                  <p>{n.note}</p>
                  <small>{date(n.created_at)}</small>
                </div>
              ))
            ) : (
              <p className="muted">No notes yet.</p>
            )}
          </div>
        </aside>
      </div>
      {refund && (
        <Modal title="Issue a full refund?" onClose={() => setRefund(false)}>
          <p>
            This requests a refund of <b>{money(o.total, o.currency)}</b> through {o.provider}. This action
            moves real money when live keys are configured.
          </p>
          <p>Returned goods are not automatically restocked. Update inventory after inspecting the return.</p>
          <button
            className="button danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api('/admin/refunds/' + o.id, { method: 'POST' });
                notify(r.message);
                setRefund(false);
                reload();
              } catch (e: any) {
                notify(e.message);
                reload();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Requesting…' : 'Confirm full refund'}
          </button>
        </Modal>
      )}
    </>
  );
}

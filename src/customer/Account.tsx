import { NavLink, Navigate, useLocation, Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useStore } from '../contexts/StoreContext';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import { PageTitle, Loading, Empty, ErrorBox, Badge, Field, Pager } from '../components/UI';
import { money, date } from '../utilities/format';
export default function Account() {
  const { user, authLoading, logout, notify, refreshAuth } = useStore();
  const location = useLocation(),
    navigate = useNavigate();
  const section = location.pathname.split('/')[2] || 'profile';
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi(
    user
      ? section === 'orders' || section === 'payments'
        ? '/orders?limit=20&page=' + page
        : section === 'addresses'
          ? '/addresses'
          : section === 'notifications'
            ? '/notifications'
            : null
      : null,
  );
  const [busy, setBusy] = useState(false);
  if (authLoading) return <Loading />;
  if (!user) return <Navigate to="/login?next=/account" replace />;
  const saveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api('/profile', { method: 'PATCH', body: { name: fd.get('name'), phone: fd.get('phone') } });
      notify('Your details have been updated.');
      await refreshAuth();
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="container">
      <PageTitle eyebrow="YOUR LITTLE CORNER" title={`Hello, ${user.name.split(' ')[0]}.`} />
      <div className="account-layout">
        <aside className="account-nav">
          {[
            ['profile', 'My details'],
            ['orders', 'My orders'],
            ['addresses', 'Saved addresses'],
            ['payments', 'Payment history'],
            ['notifications', 'Notifications'],
            ['password', 'Password & security'],
          ].map(([v, l]) => (
            <NavLink key={v} to={'/account/' + v}>
              {l}
            </NavLink>
          ))}
          <Link to="/wishlist">My wishlist</Link>
          {user.role !== 'customer' && <Link to="/admin">Manage store</Link>}
          <button
            onClick={() =>
              logout()
                .then(() => navigate('/'))
                .catch((e: any) => notify(e.message))
            }
          >
            Sign out
          </button>
        </aside>
        <section>
          {error && <ErrorBox message={error} retry={reload} />}{' '}
          {section === 'profile' ? (
            <form onSubmit={saveProfile}>
              <h2>Personal details</h2>
              <Field label="Full name">
                <input name="name" defaultValue={user.name} required minLength={2} />
              </Field>
              <Field label="Email address">
                <input value={user.email} disabled />
              </Field>
              <Field label="Phone number">
                <input name="phone" defaultValue={user.phone} type="tel" />
              </Field>
              <button className="button" disabled={busy}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </form>
          ) : section === 'password' ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                try {
                  await api('/auth/password', {
                    method: 'POST',
                    body: { current_password: fd.get('current'), password: fd.get('password') },
                  });
                  await refreshAuth();
                  navigate('/login');
                  notify('Password updated. Please sign in again.');
                } catch (e: any) {
                  notify(e.message);
                }
              }}
            >
              <h2>Password & security</h2>
              <Field label="Current password">
                <input name="current" type="password" autoComplete="current-password" required />
              </Field>
              <Field label="New password">
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                />
              </Field>
              <button className="button">Change password</button>
            </form>
          ) : loading ? (
            <Loading />
          ) : section === 'addresses' ? (
            <>
              <h2>Saved addresses</h2>
              {data?.length ? (
                data.map((a: any) => (
                  <article className="panel" key={a.id}>
                    <h3>{a.label}</h3>
                    <p>
                      {a.details.full_name}
                      <br />
                      {a.details.address}
                      <br />
                      {a.details.city}, {a.details.region}
                      <br />
                      {a.details.country}
                    </p>
                    <button
                      className="text-button"
                      onClick={() =>
                        api('/addresses/' + a.id, { method: 'DELETE' })
                          .then(reload)
                          .catch((e: any) => notify(e.message))
                      }
                    >
                      Remove address
                    </button>
                  </article>
                ))
              ) : (
                <Empty title="No saved addresses yet" text="Save your delivery address during checkout." />
              )}
            </>
          ) : section === 'notifications' ? (
            <>
              <h2>Your updates</h2>
              {data?.length ? (
                data.map((n: any) => (
                  <article className="panel" key={n.id}>
                    <div className="between">
                      <h3>{n.title}</h3>
                      <small>{date(n.created_at)}</small>
                    </div>
                    <p>{n.body}</p>
                    {n.order_id && (
                      <Link className="text-button" to={'/order/' + n.order_id}>
                        View order
                      </Link>
                    )}
                    {!n.read_at && (
                      <button
                        className="text-button"
                        onClick={() =>
                          api('/notifications/' + n.id, { method: 'PATCH' })
                            .then(reload)
                            .catch((e: any) => notify(e.message))
                        }
                      >
                        Mark as read
                      </button>
                    )}
                  </article>
                ))
              ) : (
                <Empty title="You’re all caught up" />
              )}
            </>
          ) : (
            <>
              <h2>{section === 'payments' ? 'Payment history' : 'Your orders'}</h2>
              {data?.items?.length ? (
                <>
                  {data.items.map((o: any) => (
                    <Link className="order-list-card" to={'/order/' + o.number} key={o.id}>
                      <div>
                        <b>{o.number}</b>
                        <small>{date(o.created_at)}</small>
                      </div>
                      <Badge status={section === 'payments' ? o.payment_status : o.status} />
                      <b>{money(o.total, o.currency)}</b>
                      <span>View order →</span>
                    </Link>
                  ))}
                  <Pager page={data.page} pages={data.pages} onChange={setPage} />
                </>
              ) : (
                <Empty
                  title="Your first good find awaits."
                  text="Your orders will appear here."
                  link="Explore the collection"
                />
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

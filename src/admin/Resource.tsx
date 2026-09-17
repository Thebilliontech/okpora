import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { Search, Download, Plus } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useStore } from '../contexts/StoreContext';
import { api } from '../services/api';
import { PageTitle, Loading, ErrorBox, Empty, Badge, Pager, Modal, Field } from '../components/UI';
import { money, date, label } from '../utilities/format';
const fields: Record<string, string[]> = {
  orders: [
    'number',
    'customer',
    'email',
    'phone',
    'products',
    'quantity',
    'total',
    'payment_status',
    'payment_reference',
    'created_at',
    'address',
    'min_days',
    'max_days',
    'status',
  ],
  products: ['image', 'name', 'sku', 'price', 'visible', 'featured'],
  categories: ['name', 'slug', 'position'],
  customers: ['name', 'email', 'phone', 'orders', 'total_spent', 'recent_purchase', 'role', 'disabled'],
  payments: ['reference', 'number', 'customer', 'amount', 'currency', 'provider', 'status', 'created_at'],
  inventory: ['name', 'variant', 'sku', 'quantity', 'low_stock_threshold'],
  delivery: ['name', 'country', 'region', 'city', 'fee', 'free_threshold', 'min_days', 'max_days', 'active'],
  reviews: ['product', 'customer', 'rating', 'body', 'status'],
  coupons: ['code', 'kind', 'value', 'minimum', 'usage_limit', 'expires_at', 'active'],
  notifications: ['title', 'body', 'created_at', 'read_at'],
  newsletter: ['email', 'created_at'],
  contacts: ['name', 'email', 'message', 'created_at'],
  'audit-log': ['administrator', 'action', 'object_type', 'object_id', 'details', 'created_at'],
};
export default function Resource() {
  const { resource = 'orders' } = useParams();
  const { store, user, notify, refreshStore } = useStore();
  const [params, setParams] = useSearchParams();
  const { data, loading, error, reload } = useApi(
    '/admin/' + resource + '?' + params,
    resource === 'notifications' ? 15000 : 0,
  );
  const [editing, setEditing] = useState<any>(null),
    [removing, setRemoving] = useState<any>(null),
    [customer, setCustomer] = useState<any>(null);
  const columns = fields[resource] || [];
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };
  const display = (key: string, value: any, row: any) => {
    if (value === null || value === undefined) return '—';
    if (
      ['price', 'total', 'amount', 'total_spent', 'fee', 'free_threshold', 'minimum', 'maximum'].includes(key)
    )
      return money(value, row.currency || store.currency);
    if (key === 'value')
      return row.kind === 'percentage'
        ? value + '%'
        : row.kind === 'free_shipping'
          ? 'Free delivery'
          : money(value, store.currency);
    if (['status', 'payment_status', 'role'].includes(key)) return <Badge status={value} />;
    if (key === 'image') return value ? <img className="table-image" src={value} alt="" /> : '—';
    if (key.endsWith('_at') || key === 'recent_purchase') return date(value);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (key === 'address') return `${value.city}, ${value.region}`;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };
  const changeReview = (id: string, status: string) =>
    api('/admin/reviews/' + id, { method: 'PATCH', body: { status } })
      .then(reload)
      .catch((e: any) => notify(e.message));
  return (
    <>
      <div className="section-head">
        <PageTitle eyebrow="STORE MANAGEMENT" title={label(resource)} />
        <div className="button-group">
          <a className="button secondary" href={'/api/admin/' + resource + '?' + params + '&export=csv'}>
            <Download size={16} />
            Export CSV
          </a>
          {resource === 'products' ? (
            <Link className="button" to="/admin/products/new">
              <Plus size={17} />
              Add product
            </Link>
          ) : (
            ['categories', 'delivery', 'coupons'].includes(resource) && (
              <button className="button" onClick={() => setEditing({})}>
                <Plus size={17} />
                Add {resource === 'categories' ? 'category' : resource === 'delivery' ? 'zone' : 'coupon'}
              </button>
            )
          )}
        </div>
      </div>
      <div className="table-toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search records"
            placeholder={'Search ' + label(resource).toLowerCase()}
            value={params.get('q') || ''}
            onChange={(e) => update('q', e.target.value)}
          />
        </div>
        {['orders', 'reviews', 'payments'].includes(resource) && (
          <select
            aria-label="Filter by status"
            value={params.get('status') || ''}
            onChange={(e) => update('status', e.target.value)}
          >
            <option value="">All statuses</option>
            {(resource === 'orders'
              ? [
                  'pending_payment',
                  'paid',
                  'confirmed',
                  'processing',
                  'packed',
                  'shipped',
                  'out_for_delivery',
                  'delivered',
                  'cancelled',
                  'refunded',
                ]
              : resource === 'reviews'
                ? ['pending', 'approved', 'hidden']
                : ['successful', 'pending', 'failed', 'refunded']
            ).map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        )}
        {['orders', 'products'].includes(resource) && (
          <select
            aria-label="Sort records"
            value={params.get('sort') || ''}
            onChange={(e) => update('sort', e.target.value)}
          >
            <option value="">Newest first</option>
            <option value={resource === 'orders' ? 'total' : 'price'}>
              {resource === 'orders' ? 'Highest total' : 'Lowest price'}
            </option>
          </select>
        )}
        <span className="muted">{data?.total ?? 0} records</span>
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} retry={reload} />
      ) : !data?.items.length ? (
        <Empty title={'No ' + label(resource).toLowerCase() + ' yet'} text="Your records will appear here." />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {columns.map((key) => (
                    <th key={key}>{label(key)}</th>
                  ))}
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row: any, index: number) => (
                  <tr key={row.id || row.email || index}>
                    {columns.map((key) => (
                      <td
                        className={
                          ['message', 'body', 'products', 'details'].includes(key) ? 'wide-cell' : ''
                        }
                        key={key}
                      >
                        {display(key, row[key], row)}
                      </td>
                    ))}
                    <td>
                      <div className="table-actions">
                        {resource === 'orders' && <Link to={'/admin/orders/' + row.id}>Open →</Link>}
                        {resource === 'products' && (
                          <>
                            <Link to={'/admin/products/' + row.id}>Edit</Link>
                            <button onClick={() => setRemoving(row)}>Archive</button>
                          </>
                        )}
                        {resource === 'inventory' && (
                          <Link to={'/admin/products/' + row.product_id}>Edit stock</Link>
                        )}
                        {resource === 'payments' && (
                          <Link to={'/admin/orders/' + row.order_id}>View order</Link>
                        )}
                        {['categories', 'delivery', 'coupons'].includes(resource) && (
                          <>
                            <button onClick={() => setEditing(row)}>Edit</button>
                            <button onClick={() => setRemoving(row)}>
                              {resource === 'categories' ? 'Delete' : 'Deactivate'}
                            </button>
                          </>
                        )}
                        {resource === 'reviews' && (
                          <>
                            <button onClick={() => changeReview(row.id, 'approved')}>Approve</button>
                            <button onClick={() => changeReview(row.id, 'hidden')}>Hide</button>
                          </>
                        )}
                        {resource === 'notifications' && (
                          <>
                            {row.order_id && <Link to={'/admin/orders/' + row.order_id}>Open order</Link>}
                            {!row.read_at && (
                              <button
                                onClick={() =>
                                  api('/admin/notifications/' + row.id, { method: 'PATCH' })
                                    .then(reload)
                                    .catch((e: any) => notify(e.message))
                                }
                              >
                                Mark read
                              </button>
                            )}
                          </>
                        )}
                        {resource === 'customers' && (
                          <button
                            onClick={() =>
                              api('/admin/customers/' + row.id)
                                .then(setCustomer)
                                .catch((e: any) => notify(e.message))
                            }
                          >
                            View customer
                          </button>
                        )}
                        {resource === 'contacts' && <a href={'mailto:' + row.email}>Reply by email</a>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={data.page} pages={data.pages} onChange={(p) => update('page', String(p))} />
        </>
      )}
      {editing && (
        <ResourceEditor
          resource={resource}
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
            if (resource === 'categories') refreshStore();
          }}
        />
      )}
      {removing && (
        <Modal title="Confirm this change" onClose={() => setRemoving(null)}>
          <p>
            {resource === 'products'
              ? 'Archive this product? Existing order records are preserved.'
              : resource === 'categories'
                ? 'Delete this category? Products will remain in the store.'
                : 'Deactivate this entry?'}
          </p>
          <div className="button-group">
            <button className="button secondary" onClick={() => setRemoving(null)}>
              Keep it
            </button>
            <button
              className="button danger"
              onClick={() =>
                api('/admin/' + resource + '/' + removing.id, { method: 'DELETE' })
                  .then(() => {
                    setRemoving(null);
                    reload();
                  })
                  .catch((e: any) => notify(e.message))
              }
            >
              Confirm
            </button>
          </div>
        </Modal>
      )}
      {customer && (
        <Modal title={customer.customer.name} onClose={() => setCustomer(null)}>
          <p>
            {customer.customer.email}
            <br />
            {customer.customer.phone}
          </p>
          <h3>Recent order history</h3>
          <Link
            className="text-button"
            to={'/admin/orders?q=' + encodeURIComponent(customer.customer.email)}
            onClick={() => setCustomer(null)}
          >
            Browse full order history →
          </Link>
          {customer.orders.map((o: any) => (
            <p key={o.number}>
              <Link to={'/admin/orders/' + o.number} onClick={() => setCustomer(null)}>
                {o.number}
              </Link>{' '}
              · {money(o.total, o.currency)} · {label(o.status)}
            </p>
          ))}
          {user.role === 'super_admin' && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                try {
                  await api('/admin/customers/' + customer.customer.id, {
                    method: 'PATCH',
                    body: { role: fd.get('role'), disabled: fd.get('disabled') === 'on' },
                  });
                  setCustomer(null);
                  reload();
                  notify('Access updated.');
                } catch (e: any) {
                  notify(e.message);
                }
              }}
            >
              <Field label="Account role">
                <select name="role" defaultValue={customer.customer.role}>
                  {['customer', 'admin', 'super_admin'].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Field>
              <label className="check">
                <input name="disabled" type="checkbox" defaultChecked={customer.customer.disabled} />
                Disable this account
              </label>
              <button className="button">Update access</button>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
function ResourceEditor({
  resource,
  record,
  onClose,
  onSaved,
}: {
  resource: string;
  record: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify, categories } = useStore();
  const [busy, setBusy] = useState(false),
    [kind, setKind] = useState(record.kind || 'percentage');
  const definitions: Record<string, Array<[string, string, string]>> = {
    categories: [
      ['name', 'Category name', 'text'],
      ['slug', 'URL slug', 'text'],
      ['image', 'Image URL', 'text'],
      ['position', 'Display position', 'number'],
    ],
    delivery: [
      ['name', 'Zone name', 'text'],
      ['country', 'Country', 'text'],
      ['region', 'State / region (blank = all)', 'text'],
      ['city', 'City (blank = all)', 'text'],
      ['fee', 'Delivery fee', 'money'],
      ['free_threshold', 'Free delivery above (optional)', 'optional-money'],
      ['min_days', 'Minimum business days', 'number'],
      ['max_days', 'Maximum business days', 'number'],
    ],
    coupons: [
      ['code', 'Coupon code', 'text'],
      ['value', 'Discount value (% or currency)', 'discount'],
      ['minimum', 'Minimum order', 'money'],
      ['maximum', 'Maximum discount (optional)', 'optional-money'],
      ['usage_limit', 'Total use limit (optional)', 'optional-number'],
      ['starts_at', 'Starts at (optional)', 'datetime-local'],
      ['expires_at', 'Expires at (optional)', 'datetime-local'],
    ],
  };
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const input: any = {};
    for (const [key, , type] of definitions[resource]) {
      const v = String(fd.get(key) || '');
      input[key] =
        type === 'money'
          ? Math.round(Number(v) * 100)
          : type === 'optional-money'
            ? v
              ? Math.round(Number(v) * 100)
              : null
            : type === 'number'
              ? Number(v)
              : type === 'optional-number'
                ? v
                  ? Number(v)
                  : null
                : type === 'discount'
                  ? kind === 'percentage'
                    ? Number(v)
                    : kind === 'free_shipping'
                      ? 0
                      : Math.round(Number(v) * 100)
                  : type === 'datetime-local'
                    ? v
                      ? new Date(v).toISOString()
                      : null
                    : v;
    }
    if (resource !== 'categories') input.active = fd.get('active') === 'on';
    if (resource === 'coupons') {
      input.kind = kind;
      input.category_ids = fd.getAll('category_ids');
      input.product_ids = String(fd.get('product_ids') || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    try {
      await api('/admin/' + resource + (record.id ? '/' + record.id : ''), {
        method: record.id ? 'PUT' : 'POST',
        body: input,
      });
      notify('Saved.');
      onSaved();
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={
        (record.id ? 'Edit ' : 'Add ') +
        (resource === 'categories' ? 'category' : resource === 'delivery' ? 'delivery zone' : 'coupon')
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        {resource === 'coupons' && (
          <Field label="Discount type">
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed amount</option>
              <option value="free_shipping">Free delivery</option>
            </select>
          </Field>
        )}
        <div className="form-grid">
          {definitions[resource].map(([key, title, type]) => {
            let v =
              record[key] ??
              (key === 'country' ? 'Nigeria' : key === 'min_days' ? 3 : key === 'max_days' ? 5 : '');
            if (type.includes('money') && v !== '') v = v / 100;
            if (type === 'discount' && kind === 'fixed' && v !== '') v = v / 100;
            if (type === 'datetime-local' && v) v = new Date(v).toISOString().slice(0, 16);
            return (
              <Field label={title} key={key}>
                <input
                  name={key}
                  type={
                    type.includes('money') || type.includes('number') || type === 'discount' ? 'number' : type
                  }
                  step={type.includes('money') || type === 'discount' ? '0.01' : undefined}
                  min={type.includes('number') || type.includes('money') ? '0' : undefined}
                  defaultValue={v}
                  required={[
                    'name',
                    'slug',
                    'country',
                    'fee',
                    'min_days',
                    'max_days',
                    'code',
                    'value',
                    'minimum',
                    'position',
                  ].includes(key)}
                />
              </Field>
            );
          })}
        </div>
        {resource === 'coupons' && (
          <>
            <Field label="Applicable categories (leave empty for all)">
              <select multiple name="category_ids" defaultValue={record.category_ids || []}>
                {categories.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Applicable product IDs (comma separated; optional)">
              <input name="product_ids" defaultValue={(record.product_ids || []).join(',')} />
            </Field>
          </>
        )}
        {resource !== 'categories' && (
          <label className="check">
            <input name="active" type="checkbox" defaultChecked={record.active ?? true} />
            Active
          </label>
        )}
        <button className="button" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </Modal>
  );
}

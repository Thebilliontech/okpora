import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useStore } from '../contexts/StoreContext';
import { Loading, ErrorBox, PageTitle, Empty } from '../components/UI';
import { money, label } from '../utilities/format';
function Chart({
  data,
  value,
  title,
  currency,
}: {
  data: any[];
  value: string;
  title: string;
  currency?: string;
}) {
  const max = Math.max(1, ...data.map((d) => Number(d[value])));
  return (
    <div className="panel chart-panel">
      <div className="section-head">
        <h3>{title}</h3>
        <span className="muted">Last 30 days</span>
      </div>
      {data.length ? (
        <>
          <div className="bar-chart" aria-label={title}>
            {data.map((d: any, i: number) => (
              <div key={i} className="bar-column">
                <span
                  title={`${d.day}: ${currency ? money(d[value], currency) : d[value]}`}
                  style={{ height: Math.max(2, (Number(d[value]) / max) * 160) + 'px' }}
                />
                <small>{d.day.slice(5)}</small>
              </div>
            ))}
          </div>
          <div className="chart-total">
            {currency
              ? money(
                  data.reduce((s, d) => s + Number(d[value]), 0),
                  currency,
                )
              : data.reduce((s, d) => s + Number(d[value]), 0)}{' '}
            <small>in this period</small>
          </div>
        </>
      ) : (
        <Empty title="No activity yet" text="Your store’s data will appear here." />
      )}
    </div>
  );
}
export default function Dashboard() {
  const { store } = useStore();
  const { data, loading, error, reload } = useApi('/admin/dashboard', 30000);
  const { data: checks } = useApi('/admin/config');
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} retry={reload} />;
  return (
    <>
      <div className="section-head">
        <PageTitle eyebrow="OKPORA ADMIN" title="Your everyday overview." />
        <Link className="button" to="/admin/products/new">
          Add a product <ArrowUpRight size={17} />
        </Link>
      </div>
      {checks?.missing.length > 0 && (
        <div className="setup-banner">
          <b>Finish connecting your store</b>
          <span>{checks.missing.join(' · ')}</span>
          <Link to="/admin/settings">Open settings →</Link>
        </div>
      )}
      <div className="stat-grid">
        {[
          ['revenue', 'Revenue'],
          ['orders', 'Orders'],
          ['customers', 'Customers'],
          ['products', 'Active products'],
        ].map(([key, title]) => (
          <div className="stat-card" key={key}>
            <span>{title}</span>
            <b>{key === 'revenue' ? money(data.summary[key], store.currency) : data.summary[key]}</b>
            <small>{key === 'revenue' ? 'Verified paid orders' : 'All time'}</small>
          </div>
        ))}
      </div>
      <div className="status-grid">
        {[
          'paid_orders',
          'pending_orders',
          'processing',
          'shipped',
          'delivered',
          'cancelled',
          'low_stock',
        ].map((k) => (
          <Link to={'/admin/' + (k === 'low_stock' ? 'inventory' : 'orders')} key={k}>
            <b>{data.summary[k]}</b>
            <span>{label(k)}</span>
          </Link>
        ))}
      </div>
      <div className="charts-grid">
        <Chart data={data.daily} title="Revenue over time" value="revenue" currency={store.currency} />
        <Chart data={data.daily} title="Orders over time" value="orders" />
      </div>
      <div className="charts-grid">
        <div className="panel">
          <h3>Your most-loved pieces</h3>
          {data.top.length ? (
            data.top.map((p: any, i: number) => (
              <div className="top-product" key={p.name}>
                <span>{i + 1}</span>
                <b>{p.name}</b>
                <span>{p.quantity} sold</span>
                <strong>{money(p.revenue, store.currency)}</strong>
              </div>
            ))
          ) : (
            <Empty title="Your bestsellers start here" />
          )}
        </div>
        <Chart data={data.growth} title="Customer growth" value="customers" />
      </div>
    </>
  );
}

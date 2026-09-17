import { useEffect, useState } from 'react';
import { useApi } from '../hooks/useApi';
import { useStore } from '../contexts/StoreContext';
import { api } from '../services/api';
import { PageTitle, Field, Loading, ErrorBox } from '../components/UI';
export default function Settings() {
  const { data, loading, error, reload } = useApi('/admin/settings');
  const { data: config, reload: reloadConfig } = useApi('/admin/config');
  const { notify, refreshStore } = useStore();
  const [value, setValue] = useState<any>(null),
    [tab, setTab] = useState('store'),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setValue(data);
  }, [data]);
  if (loading || !value) return error ? <ErrorBox message={error} retry={reload} /> : <Loading />;
  const set = (key: string, v: any) => setValue({ ...value, store: { ...value.store, [key]: v } });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/admin/settings', { method: 'PUT', body: value });
      await refreshStore();
      notify('Store settings saved.');
    } catch (e: any) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageTitle eyebrow="MAKE IT YOURS" title="Store settings & content" />
      <div className="tabs">
        {['store', 'homepage', 'contact', 'about', 'faqs', 'policies', 'connections'].map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <form className="settings-form" onSubmit={save}>
        {tab === 'store' && (
          <>
            <h2>Store identity</h2>
            <Field label="Store name">
              <input required value={value.store.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Logo URL (optional)">
              <input value={value.store.logo || ''} onChange={(e) => set('logo', e.target.value)} />
            </Field>
            <Field label="Store currency">
              <select value={value.store.currency} onChange={(e) => set('currency', e.target.value)}>
                {['NGN', 'USD', 'GBP', 'EUR', 'GHS', 'KES', 'ZAR'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <p className="muted">
              Currency can be changed before your first order. Changing it does not convert prices: update all
              product prices and delivery fees before launch. Your payment account must support the selected
              currency.
            </p>
            <Field label="Tax percentage">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={value.store.tax_percent}
                onChange={(e) => set('tax_percent', Number(e.target.value))}
              />
            </Field>
            <Field label="Footer description">
              <textarea value={value.store.footer} onChange={(e) => set('footer', e.target.value)} />
            </Field>
          </>
        )}
        {tab === 'homepage' && (
          <>
            <h2>Your first impression</h2>
            {[
              ['announcement', 'Announcement'],
              ['hero_label', 'Hero label'],
              ['hero_title', 'Hero heading — one line per row'],
              ['hero_text', 'Hero description'],
              ['hero_image', 'Hero image URL'],
            ].map(([k, l]) => (
              <Field key={k} label={l}>
                {k === 'hero_title' || k === 'hero_text' ? (
                  <textarea value={value.store[k]} onChange={(e) => set(k, e.target.value)} />
                ) : (
                  <input value={value.store[k]} onChange={(e) => set(k, e.target.value)} />
                )}
              </Field>
            ))}
            <p className="muted">Manage featured products and new arrivals in the product editor.</p>
          </>
        )}
        {tab === 'contact' && (
          <>
            <h2>Contact & social links</h2>
            {[
              ['email', 'Public email'],
              ['phone', 'Phone number'],
              ['address', 'Business address'],
              ['whatsapp', 'WhatsApp number including country code'],
              ['instagram', 'Instagram URL'],
              ['facebook', 'Facebook URL'],
            ].map(([k, l]) => (
              <Field key={k} label={l}>
                <input value={value.store[k]} onChange={(e) => set(k, e.target.value)} />
              </Field>
            ))}
          </>
        )}
        {tab === 'about' && (
          <Field label="About Okpora">
            <textarea rows={14} value={value.store.about} onChange={(e) => set('about', e.target.value)} />
          </Field>
        )}
        {tab === 'faqs' && (
          <>
            <h2>Questions & answers</h2>
            {value.store.faqs.map((f: any, i: number) => (
              <div className="panel" key={i}>
                {['category', 'question', 'answer'].map((k) => (
                  <Field key={k} label={k.charAt(0).toUpperCase() + k.slice(1)}>
                    <textarea
                      value={f[k]}
                      onChange={(e) =>
                        set(
                          'faqs',
                          value.store.faqs.map((q: any, index: number) =>
                            index === i ? { ...q, [k]: e.target.value } : q,
                          ),
                        )
                      }
                    />
                  </Field>
                ))}
                <button
                  type="button"
                  className="text-button danger-text"
                  onClick={() =>
                    set(
                      'faqs',
                      value.store.faqs.filter((_: any, index: number) => index !== i),
                    )
                  }
                >
                  Remove question
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                set('faqs', [...value.store.faqs, { category: 'Orders', question: '', answer: '' }])
              }
            >
              Add question
            </button>
          </>
        )}
        {tab === 'policies' && (
          <>
            <h2>Your store policies</h2>
            <p className="muted">
              Publish policies that reflect your business practices and applicable requirements before opening
              checkout. These fields accept plain text and line breaks.
            </p>
            {['privacy', 'terms', 'shipping', 'returns', 'refunds', 'cookies'].map((k) => (
              <Field key={k} label={k.charAt(0).toUpperCase() + k.slice(1)}>
                <textarea
                  rows={9}
                  value={value.policies[k] || ''}
                  onChange={(e) =>
                    setValue({ ...value, policies: { ...value.policies, [k]: e.target.value } })
                  }
                />
              </Field>
            ))}
          </>
        )}
        {tab === 'connections' && (
          <>
            <h2>Connected services</h2>
            <p>
              Production secret keys are configured in Netlify Environment Variables. See{' '}
              <code>PRIVATE_CONFIG/</code> in your project folder.
            </p>
            <div className="panel">
              <p>
                <b>Payment provider:</b> {config?.payment_provider}
              </p>
              <p>
                <b>Image storage:</b> {config?.storage_configured ? 'Connected' : 'Not configured'}
              </p>
              <p>
                <b>Queued emails:</b> {config?.email_pending ?? '—'}
              </p>
              {config?.missing.length ? (
                <ErrorBox message={'Missing: ' + config.missing.join(', ')} />
              ) : (
                <div className="success-box">
                  Required configuration is present. Complete the live-service launch checks.
                </div>
              )}
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  api('/admin/email-retry', { method: 'POST' })
                    .then((r) => {
                      notify(`${r.sent} email(s) sent.`);
                      reloadConfig();
                    })
                    .catch((e: any) => notify(e.message))
                }
              >
                Retry queued emails
              </button>
            </div>
            <p className="muted">
              Delivery zones and estimates are managed under Delivery. Staff access is managed under Customers
              by a super administrator. Payment provider and notification email changes require a Netlify
              environment update and redeploy.
            </p>
          </>
        )}
        {tab !== 'connections' && (
          <button className="button" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        )}
      </form>
    </>
  );
}

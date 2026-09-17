import { useParams, Link, useLocation, Navigate } from 'react-router-dom';
import { useStore } from '../contexts/StoreContext';
import { api } from '../services/api';
import { useState } from 'react';
import { PageTitle, Field, ErrorBox, Empty, Loading } from '../components/UI';
import ProductCard from '../components/ProductCard';
export default function Content() {
  const { store, policies, notify, wishlist, user, authLoading } = useStore();
  const { slug } = useParams(),
    { pathname } = useLocation();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  if (pathname === '/wishlist') {
    if (authLoading) return <Loading />;
    if (!user) return <Navigate to="/login?next=/wishlist" replace />;
    return (
      <div className="container">
        <PageTitle eyebrow="KEEP THE GOOD ONES CLOSE" title="Your favourites" />
        {wishlist.length ? (
          <div className="product-grid">
            {wishlist.map((p: any) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <Empty
            title="A place for your favourites."
            text="Tap the heart on any piece to save it here."
            link="Find something you love"
          />
        )}
      </div>
    );
  }
  if (pathname === '/about')
    return (
      <div className="container about-page">
        <PageTitle eyebrow="OUR STORY" title="Everyday, a little better." />
        <div className="editorial">
          <div className="editorial-image">
            <img src="/ceramics.jpg" alt="A curated collection of handmade ceramic vases" />
          </div>
          <div className="editorial-copy">
            <h2>Welcome to {store.name}.</h2>
            <div className="prose">
              {store.about ||
                'We’re putting the finishing touches on our story. Explore our collection and find your next favourite.'}
            </div>
            <Link className="underlined" to="/shop">
              Explore the collection ↗
            </Link>
          </div>
        </div>
      </div>
    );
  if (pathname === '/faq')
    return (
      <div className="container narrow">
        <PageTitle eyebrow="A LITTLE CLARITY" title="Good questions. Clear answers." />
        {store.faqs?.length ? (
          store.faqs.map((f: any, i: number) => (
            <details className="faq-item" key={i}>
              <summary>
                <small>{f.category}</small>
                {f.question}
              </summary>
              <p>{f.answer}</p>
            </details>
          ))
        ) : (
          <p>
            Have a question? <Link to="/contact">Get in touch</Link> and we’ll help.
          </p>
        )}
      </div>
    );
  if (pathname.startsWith('/policies/')) {
    const titles: Record<string, string> = {
      privacy: 'Privacy policy',
      terms: 'Terms & conditions',
      shipping: 'Shipping policy',
      returns: 'Return policy',
      refunds: 'Refund policy',
      cookies: 'Cookie policy',
    };
    return (
      <div className="container narrow">
        <PageTitle eyebrow="THE DETAILS" title={titles[slug!] || 'Policy'} />
        <div className="prose">
          {policies[slug!] ||
            'This policy has not been published yet. Please contact the store for details before placing an order.'}
        </div>
      </div>
    );
  }
  if (pathname === '/contact')
    return (
      <div className="container">
        <PageTitle eyebrow="WE’RE HERE FOR YOU" title="Let’s talk." />
        <div className="contact-layout">
          <div>
            <h2>
              A question, a thought,
              <br />
              or just hello.
            </h2>
            <p className="muted">Send us a note. We’ll help you find your answer.</p>
            {store.email && (
              <p>
                <a href={'mailto:' + store.email}>{store.email}</a>
              </p>
            )}
            {store.phone && (
              <p>
                <a href={'tel:' + store.phone}>{store.phone}</a>
              </p>
            )}
            {store.address && <p>{store.address}</p>}
            {store.whatsapp && (
              <a
                className="button secondary"
                href={'https://wa.me/' + store.whatsapp.replace(/\D/g, '')}
                target="_blank"
                rel="noreferrer"
              >
                Chat on WhatsApp ↗
              </a>
            )}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              const form = e.currentTarget;
              const fd = new FormData(form);
              try {
                const r = await api('/contact', { method: 'POST', body: Object.fromEntries(fd) });
                notify(r.message);
                form.reset();
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && <ErrorBox message={error} />}
            <Field label="Your name">
              <input name="name" minLength={2} required />
            </Field>
            <Field label="Email address">
              <input name="email" type="email" required />
            </Field>
            <Field label="How can we help?">
              <textarea name="message" rows={6} minLength={10} maxLength={5000} required />
            </Field>
            <input name="website" className="honeypot" tabIndex={-1} autoComplete="off" />
            <button className="button" disabled={busy}>
              {busy ? 'Sending…' : 'Send message ↗'}
            </button>
          </form>
        </div>
      </div>
    );
  return (
    <div className="container">
      <Empty
        title="This page took a wrong turn."
        text="Let’s get you back to something good."
        link="Back to the collection"
      />
    </div>
  );
}

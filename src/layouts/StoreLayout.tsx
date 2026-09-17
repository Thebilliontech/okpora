import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Search,
  UserRound,
  Heart,
  ShoppingBag,
  Menu,
  X,
  ArrowUpRight,
  ShieldCheck,
  Truck,
  PackageCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useStore } from '../contexts/StoreContext';
import { api } from '../services/api';
import { initAnalytics } from '../services/analytics';
export default function StoreLayout() {
  const { store, categories, cart, user, notify } = useStore();
  const [menu, setMenu] = useState(false),
    [search, setSearch] = useState(''),
    [suggestions, setSuggestions] = useState<any[]>([]),
    [consent, setConsent] = useState(!!localStorage.getItem('okpora_analytics'));
  const navigate = useNavigate(),
    location = useLocation();
  useEffect(() => {
    setMenu(false);
    setSuggestions([]);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    if (search.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const c = new AbortController();
    const t = setTimeout(
      () =>
        api('/products?q=' + encodeURIComponent(search) + '&limit=5', { signal: c.signal })
          .then((d) => setSuggestions(d.items))
          .catch(() => {}),
      250,
    );
    return () => {
      clearTimeout(t);
      c.abort();
    };
  }, [search]);
  useEffect(initAnalytics, []);
  const searchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/shop?q=' + encodeURIComponent(search));
    setSuggestions([]);
  };
  const subscribe = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    try {
      const r = await api('/newsletter', {
        method: 'POST',
        body: { email: data.get('email'), consent: true, website: data.get('website') },
      });
      notify(r.message);
      form.reset();
    } catch (e: any) {
      notify(e.message);
    }
  };
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="announcement">
        {store.announcement}
        <Link to="/shop">
          Explore the collection <ArrowUpRight size={13} />
        </Link>
      </div>
      <header className="header">
        <div className="container header-main">
          <button className="mobile-menu icon-button" aria-label="Open menu" onClick={() => setMenu(!menu)}>
            {menu ? <X /> : <Menu />}
          </button>
          <Link className="logo" to="/">
            {store.logo ? <img src={store.logo} alt={store.name} /> : store.name.toLowerCase()}
            <span>®</span>
          </Link>
          <form className="header-search" onSubmit={searchSubmit}>
            <Search size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search products"
              placeholder="Find your everyday favourite"
            />
            <button type="submit" aria-label="Search">
              <ArrowUpRight size={18} />
            </button>
            {suggestions.length > 0 && (
              <div className="suggestions">
                {suggestions.map((p) => (
                  <Link
                    onClick={() => {
                      setSearch('');
                      setSuggestions([]);
                    }}
                    to={'/products/' + p.slug}
                    key={p.id}
                  >
                    {p.image && <img src={p.image} alt="" />}
                    <span>{p.name}</span>
                  </Link>
                ))}
                <button onClick={searchSubmit}>View all results</button>
              </div>
            )}
          </form>
          <div className="header-actions">
            <Link className="icon-button" aria-label="My account" to={user ? '/account' : '/login'}>
              <UserRound size={21} />
              <span>{user ? 'Account' : 'Sign in'}</span>
            </Link>
            <Link className="icon-button wishlist-link" aria-label="Wishlist" to="/wishlist">
              <Heart size={21} />
            </Link>
            <Link className="icon-button cart-link" aria-label="Shopping bag" to="/cart">
              <ShoppingBag size={21} />
              <b>{cart.reduce((s: number, i: any) => s + i.quantity, 0)}</b>
            </Link>
          </div>
        </div>
        <nav className={'container nav ' + (menu ? 'open' : '')} aria-label="Main navigation">
          <Link to="/shop">Shop all</Link>
          <Link to="/shop?new=true">New arrivals</Link>
          {categories.slice(0, 5).map((c: any) => (
            <Link key={c.id} to={'/category/' + c.slug}>
              {c.name}
            </Link>
          ))}
          <Link className="nav-offers" to="/shop?sale=true">
            The special edit
          </Link>
          <Link className="nav-about" to="/about">
            Our story
          </Link>
        </nav>
      </header>
      <main id="main">
        <Outlet />
      </main>
      <div className="container service-strip">
        <div>
          <Truck />
          <span>
            <b>Delivery, considered</b>
            <small>Rates and estimates at checkout</small>
          </span>
        </div>
        <div>
          <ShieldCheck />
          <span>
            <b>Secure checkout</b>
            <small>Pay through a trusted gateway</small>
          </span>
        </div>
        <div>
          <PackageCheck />
          <span>
            <b>With you all the way</b>
            <small>Follow every order in your account</small>
          </span>
        </div>
      </div>
      <section className="newsletter">
        <div className="container newsletter-inner">
          <div>
            <span className="eyebrow">LET’S KEEP IN TOUCH</span>
            <h2>A little good in your inbox.</h2>
            <p>New arrivals, thoughtful finds and occasional offers.</p>
          </div>
          <form onSubmit={subscribe}>
            <div className="newsletter-input">
              <input
                name="email"
                type="email"
                placeholder="Your email address"
                aria-label="Email address for newsletter"
                required
              />
              <button type="submit" aria-label="Subscribe">
                <ArrowUpRight />
              </button>
            </div>
            <input name="website" className="honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <label className="check">
              <input required type="checkbox" />I agree to receive emails.{' '}
              <Link to="/policies/privacy">Privacy policy</Link>
            </label>
          </form>
        </div>
      </section>
      <footer>
        <div className="container footer-grid">
          <div>
            <Link className="logo" to="/">
              {store.name.toLowerCase()}
              <span>®</span>
            </Link>
            <p>{store.footer}</p>
            <div className="socials">
              {store.instagram && (
                <a href={store.instagram} target="_blank" rel="noreferrer">
                  Instagram ↗
                </a>
              )}
              {store.facebook && (
                <a href={store.facebook} target="_blank" rel="noreferrer">
                  Facebook ↗
                </a>
              )}
            </div>
          </div>
          <div>
            <h3>Discover</h3>
            <Link to="/shop">Shop all</Link>
            <Link to="/shop?new=true">New arrivals</Link>
            <Link to="/shop?featured=true">The favourites</Link>
            <Link to="/about">About Okpora</Link>
          </div>
          <div>
            <h3>Here to help</h3>
            <Link to="/account/orders">Track your order</Link>
            <Link to="/contact">Contact us</Link>
            <Link to="/faq">FAQs</Link>
            <Link to="/policies/returns">Returns</Link>
          </div>
          <div>
            <h3>The details</h3>
            {['privacy', 'terms', 'shipping', 'refunds', 'cookies'].map((p) => (
              <Link key={p} to={'/policies/' + p}>
                {p.charAt(0).toUpperCase() + p.slice(1)} policy
              </Link>
            ))}
            <button
              className="text-button"
              onClick={() => {
                localStorage.removeItem('okpora_analytics');
                setConsent(false);
              }}
            >
              Cookie preferences
            </button>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>
            © {new Date().getFullYear()} {store.name}. All rights reserved.
          </span>
          <span>Thoughtfully selected. Simply yours.</span>
        </div>
      </footer>
      {!consent && (
        <aside className="cookie-notice" aria-label="Cookie preferences">
          <p>
            We use essential cookies for your account and bag. Allow optional analytics to help us improve the
            store?
          </p>
          <div>
            <button
              className="button secondary"
              onClick={() => {
                localStorage.setItem('okpora_analytics', 'declined');
                setConsent(true);
              }}
            >
              Essential only
            </button>
            <button
              className="button"
              onClick={() => {
                localStorage.setItem('okpora_analytics', 'accepted');
                setConsent(true);
                initAnalytics();
              }}
            >
              Allow analytics
            </button>
          </div>
        </aside>
      )}
    </>
  );
}

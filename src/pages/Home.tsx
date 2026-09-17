import { Link } from 'react-router-dom';
import { ArrowUpRight, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../contexts/StoreContext';
import { useApi } from '../hooks/useApi';
import ProductCard from '../components/ProductCard';
import { Loading, ErrorBox, Empty } from '../components/UI';
export default function Home() {
  const { store, categories } = useStore();
  const [tab, setTab] = useState('featured=true');
  const { data, loading, error, reload } = useApi('/products?limit=8&' + tab);
  return (
    <>
      <section className="container hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="line" />
            {store.hero_label}
          </span>
          <h1>
            {store.hero_title.split('\n').map((line: string, i: number) => (
              <span key={i}>{line}</span>
            ))}
          </h1>
          <p>{store.hero_text}</p>
          <Link className="button" to="/shop">
            Discover the collection <ArrowUpRight size={19} />
          </Link>
          <div className="hero-note">
            <span>01 /</span> BEAUTIFULLY SIMPLE. DISTINCTLY YOU.
          </div>
        </div>
        <div className="hero-image">
          <img
            src={store.hero_image || '/hero.jpg'}
            alt="Sculptural ivory ceramic vases"
            fetchPriority="high"
          />
          <div className="hero-caption">
            <span>
              Small details.
              <br />
              <b>A different kind of everyday.</b>
            </span>
            <Link to="/shop" aria-label="Shop the collection">
              <ArrowUpRight />
            </Link>
          </div>
        </div>
      </section>
      <section className="container categories-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">FIND YOUR SOMETHING</span>
            <h2>Made for your everyday.</h2>
          </div>
          <Link className="underlined" to="/shop">
            Explore all <ArrowRight size={17} />
          </Link>
        </div>
        <div className="category-links">
          {categories.length ? (
            categories.map((c: any, i: number) => (
              <Link key={c.id} to={'/category/' + c.slug}>
                <span className="category-index">0{i + 1}</span>
                {c.name}
                <ArrowUpRight size={22} />
              </Link>
            ))
          ) : (
            <Link to="/shop">
              <span className="category-index">01</span>Explore the collection
              <ArrowUpRight />
            </Link>
          )}
        </div>
      </section>
      <section className="container product-section">
        <div className="section-head">
          <div>
            <span className="eyebrow">WORTH A CLOSER LOOK</span>
            <h2>Your next favourite.</h2>
          </div>
          <Link className="underlined" to="/shop">
            Shop everything <ArrowRight size={17} />
          </Link>
        </div>
        <div className="tabs">
          {[
            ['featured=true', 'The favourites'],
            ['new=true', 'Just arrived'],
            ['sort=popular', 'Most loved'],
            ['sale=true', 'Special offers'],
            ['sort=newest', 'Recently added'],
          ].map(([value, title]) => (
            <button className={tab === value ? 'active' : ''} onClick={() => setTab(value)} key={value}>
              {title}
            </button>
          ))}
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} retry={reload} />
        ) : data?.items.length ? (
          <div className="product-grid">
            {data.items.map((p: any) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        ) : (
          <Empty
            title="Something good is on the way."
            text="Our latest collection will appear here as it arrives."
          />
        )}
      </section>
      <section className="container editorial">
        <div className="editorial-image">
          <img src="/ceramics.jpg" alt="A considered collection of neutral ceramic vessels" loading="lazy" />
        </div>
        <div className="editorial-copy">
          <span className="eyebrow">THE OKPORA WAY</span>
          <h2>
            Less searching.
            <br />
            More finding.
          </h2>
          <p>
            Pieces that feel right. Details that make a difference. Find the things you’ll reach for again and
            again.
          </p>
          <Link className="underlined" to="/about">
            Get to know us <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
    </>
  );
}

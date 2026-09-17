import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, setCsrf } from '../services/api';
import { fallbackStore } from '../config/appConfig';
import { track } from '../services/analytics';
type CartItem = {
  variant_id: string;
  quantity: number;
  product_id: string;
  name: string;
  slug: string;
  image: string;
  variant: string;
  price: number;
};
const Context = createContext<any>(null);
const readGuest = (): CartItem[] => {
  try {
    return JSON.parse(localStorage.getItem('okpora_cart') || '[]');
  } catch {
    return [];
  }
};
export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<any>(fallbackStore),
    [policies, setPolicies] = useState({}),
    [categories, setCategories] = useState<any[]>([]),
    [user, setUser] = useState<any>(null),
    [authLoading, setAuthLoading] = useState(true),
    [cart, setCart] = useState<CartItem[]>(readGuest),
    [cartReady, setCartReady] = useState(false),
    [wishlist, setWishlist] = useState<any[]>([]),
    [toast, setToast] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = (text: string) => {
    setToast(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(''), 5000);
  };
  const refreshStore = async () => {
    try {
      const data = await api('/store');
      setStore({ ...fallbackStore, ...data.store });
      setPolicies(data.policies || {});
      setCategories(await api('/categories'));
    } catch {}
  };
  const loadAccount = async (u: any) => {
    setCartReady(false);
    try {
      if (u) {
        const [saved, wish] = await Promise.all([api<CartItem[]>('/cart'), api<any[]>('/wishlist')]);
        const merged = [...saved];
        for (const item of readGuest()) {
          const existing = merged.find((x) => x.variant_id === item.variant_id);
          if (existing) existing.quantity = Math.min(99, existing.quantity + item.quantity);
          else merged.push(item);
        }
        if (readGuest().length) {
          await api('/cart', {
            method: 'PUT',
            body: { items: merged.map(({ variant_id, quantity }) => ({ variant_id, quantity })) },
          });
          localStorage.removeItem('okpora_cart');
        }
        setCart(merged);
        setWishlist(wish);
      } else {
        setCart(readGuest());
        setWishlist([]);
      }
      setCartReady(true);
    } catch (e: any) {
      notify('Your saved bag could not be loaded. Refresh before changing it.');
    }
  };
  const refreshAuth = async () => {
    try {
      const data = await api('/me');
      setCsrf(data.csrf || '');
      setUser(data.user);
      await loadAccount(data.user);
    } catch {
      setCartReady(true);
    } finally {
      setAuthLoading(false);
    }
  };
  useEffect(() => {
    refreshStore();
    refreshAuth();
  }, []);
  const login = async (input: any) => {
    const data = await api('/auth/login', { method: 'POST', body: input });
    setCsrf(data.csrf);
    setUser(data.user);
    await loadAccount(data.user);
    return data.user;
  };
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    setCsrf('');
    setUser(null);
    setCart(readGuest());
    setWishlist([]);
    setCartReady(true);
  };
  const saveCart = async (next: CartItem[]) => {
    if (!cartReady) throw new Error('Your bag is still loading. Please refresh.');
    if (user)
      await api('/cart', {
        method: 'PUT',
        body: { items: next.map(({ variant_id, quantity }) => ({ variant_id, quantity })) },
      });
    else localStorage.setItem('okpora_cart', JSON.stringify(next));
    setCart(next);
  };
  const add = async (p: any, v: any, quantity = 1) => {
    if (v.stock < quantity) throw new Error('This quantity is not available.');
    const next = cart.map((i) => ({ ...i }));
    const existing = next.find((i) => i.variant_id === v.id);
    if (existing) {
      if (existing.quantity + quantity > v.stock) throw new Error('Not enough stock for this quantity.');
      existing.quantity = Math.min(99, existing.quantity + quantity);
    } else
      next.push({
        variant_id: v.id,
        quantity,
        product_id: p.id,
        name: p.name,
        slug: p.slug,
        image: p.image,
        variant: v.name,
        price: v.price ?? p.price,
      });
    await saveCart(next);
    track('AddToCart', { value: (v.price ?? p.price) / 100, currency: store.currency, content_ids: [p.id] });
    notify('Added to your bag.');
  };
  const toggleWishlist = async (p: any) => {
    if (!user) throw new Error('Sign in to save your favourites.');
    if (wishlist.some((x) => x.id === p.id)) {
      await api('/wishlist/' + p.id, { method: 'DELETE' });
      setWishlist(wishlist.filter((x) => x.id !== p.id));
      notify('Removed from wishlist.');
    } else {
      await api('/wishlist', { method: 'POST', body: { product_id: p.id } });
      setWishlist([...wishlist, p]);
      notify('Saved to your wishlist.');
    }
  };
  return (
    <Context.Provider
      value={{
        store,
        policies,
        categories,
        user,
        authLoading,
        cart,
        cartReady,
        wishlist,
        notify,
        login,
        logout,
        refreshAuth,
        refreshStore,
        saveCart,
        add,
        toggleWishlist,
      }}
    >
      {children}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            ×
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export const useStore = () => useContext(Context);

import { lazy, Suspense, Component, type ReactNode } from 'react';
import { Routes, Route } from 'react-router-dom';
import StoreLayout from './layouts/StoreLayout';
import Home from './pages/Home';
import { Loading, ErrorBox } from './components/UI';
const Shop = lazy(() => import('./pages/Shop')),
  Product = lazy(() => import('./pages/Product')),
  Cart = lazy(() => import('./pages/Cart')),
  Checkout = lazy(() => import('./pages/Checkout')),
  Auth = lazy(() => import('./pages/Auth')),
  Content = lazy(() => import('./pages/Content')),
  Payment = lazy(() => import('./pages/Payment')),
  Account = lazy(() => import('./customer/Account')),
  Order = lazy(() => import('./customer/Order')),
  AdminLayout = lazy(() => import('./admin/AdminLayout')),
  Dashboard = lazy(() => import('./admin/Dashboard')),
  Resource = lazy(() => import('./admin/Resource')),
  ProductEditor = lazy(() => import('./admin/ProductEditor')),
  OrderEditor = lazy(() => import('./admin/OrderEditor')),
  Settings = lazy(() => import('./admin/Settings'));
class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="container">
        <ErrorBox
          message="This page could not load. Please refresh and try again."
          retry={() => window.location.reload()}
        />
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="container">
            <Loading />
          </div>
        }
      >
        <Routes>
          <Route element={<StoreLayout />}>
            <Route index element={<Home />} />
            <Route path="shop" element={<Shop />} />
            <Route path="category/:slug" element={<Shop />} />
            <Route path="products/:slug" element={<Product />} />
            <Route path="cart" element={<Cart />} />
            <Route path="checkout" element={<Checkout />} />
            {['login', 'register', 'forgot-password', 'reset-password', 'verify-email'].map((path) => (
              <Route key={path} path={path} element={<Auth />} />
            ))}
            <Route path="account/*" element={<Account />} />
            <Route path="order/:id" element={<Order />} />
            <Route path="payment/:result" element={<Payment />} />
            {['about', 'contact', 'faq', 'wishlist', 'policies/:slug', '*'].map((path) => (
              <Route key={path} path={path} element={<Content />} />
            ))}
          </Route>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="analytics" element={<Dashboard />} />
            <Route path="settings" element={<Settings />} />
            <Route path="content" element={<Settings />} />
            <Route path="products/:id" element={<ProductEditor />} />
            <Route path="orders/:id" element={<OrderEditor />} />
            <Route path=":resource" element={<Resource />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

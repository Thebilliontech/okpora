import { NavLink, Navigate, Outlet, Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Layers,
  Users,
  CreditCard,
  Boxes,
  Truck,
  Star,
  Ticket,
  Bell,
  Mail,
  FileText,
  ChartNoAxesCombined,
  Settings,
  ClipboardList,
  LogOut,
  Menu,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../contexts/StoreContext';
import { Loading } from '../components/UI';
export const adminLinks = [
  ['', 'Dashboard', LayoutDashboard],
  ['orders', 'Orders', ShoppingBag],
  ['products', 'Products', Package],
  ['categories', 'Categories', Layers],
  ['customers', 'Customers', Users],
  ['payments', 'Payments', CreditCard],
  ['inventory', 'Inventory', Boxes],
  ['delivery', 'Delivery', Truck],
  ['reviews', 'Reviews', Star],
  ['coupons', 'Coupons', Ticket],
  ['notifications', 'Notifications', Bell],
  ['newsletter', 'Newsletter', Mail],
  ['contacts', 'Messages', MessageSquare],
  ['content', 'Website content', FileText],
  ['analytics', 'Analytics', ChartNoAxesCombined],
  ['settings', 'Settings', Settings],
  ['audit-log', 'Audit log', ClipboardList],
] as const;
export default function AdminLayout() {
  const { user, authLoading, store, logout, notify } = useStore();
  const [open, setOpen] = useState(false),
    navigate = useNavigate();
  if (authLoading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!['admin', 'super_admin'].includes(user.role)) return <Navigate to="/account" replace />;
  return (
    <div className="admin-shell">
      <aside className={'admin-sidebar ' + (open ? 'open' : '')}>
        <Link className="logo" to="/admin">
          {store.name.toLowerCase()}
          <span>®</span>
        </Link>
        <span className="admin-label">STORE MANAGEMENT</span>
        <nav>
          {adminLinks.map(([path, title, Icon]) => (
            <NavLink end={path === ''} key={path} to={'/admin/' + path} onClick={() => setOpen(false)}>
              <Icon size={18} />
              {title}
            </NavLink>
          ))}
        </nav>
        <button
          className="admin-signout"
          onClick={() =>
            logout()
              .then(() => navigate('/login'))
              .catch((e: any) => notify(e.message))
          }
        >
          <LogOut size={17} /> Sign out
        </button>
      </aside>
      <div className="admin-workspace">
        <header className="admin-header">
          <button
            className="mobile-menu icon-button"
            onClick={() => setOpen(!open)}
            aria-label="Toggle dashboard menu"
          >
            <Menu />
          </button>
          <span>Your store, at a glance.</span>
          <div>
            <Link to="/" target="_blank">
              View store <ExternalLink size={14} />
            </Link>
            <Link to="/admin/notifications" aria-label="Notifications">
              <Bell size={19} />
            </Link>
            <span className="avatar">{user.name.charAt(0)}</span>
          </div>
        </header>
        <main className="admin-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { appConfig } from '../config/appConfig';
declare global {
  interface Window {
    dataLayer: any[];
    gtag?: any;
    fbq?: any;
    ttq?: any;
  }
}
let initialized = false;
const script = (src: string) => {
  const el = document.createElement('script');
  el.src = src;
  el.async = true;
  document.head.append(el);
};
export function initAnalytics() {
  if (localStorage.getItem('okpora_analytics') !== 'accepted' || initialized) return;
  initialized = true;
  const ids = appConfig.analytics;
  if (ids.google) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', ids.google);
    script('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ids.google));
  }
  if (ids.meta) {
    const f: any = function (...args: any[]) {
      f.callMethod ? f.callMethod(...args) : f.queue.push(args);
    };
    f.queue = [];
    f.loaded = true;
    f.version = '2.0';
    window.fbq = f;
    script('https://connect.facebook.net/en_US/fbevents.js');
    f('init', ids.meta);
    f('track', 'PageView');
  }
  if (ids.tiktok) {
    const q: any = [];
    [
      'page',
      'track',
      'identify',
      'instances',
      'debug',
      'on',
      'off',
      'once',
      'ready',
      'alias',
      'group',
      'enableCookie',
      'disableCookie',
    ].forEach((m) => (q[m] = (...args: any[]) => q.push([m, ...args])));
    q._i = { [ids.tiktok]: [] };
    q._i[ids.tiktok]._u = 'https://analytics.tiktok.com/i18n/pixel/events.js';
    q._t = { [ids.tiktok]: Date.now() };
    q._o = { [ids.tiktok]: {} };
    window.ttq = q;
    script(
      `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(ids.tiktok)}&lib=ttq`,
    );
    q.page();
  }
}
const ga: Record<string, string> = {
  ViewContent: 'view_item',
  Search: 'search',
  AddToCart: 'add_to_cart',
  InitiateCheckout: 'begin_checkout',
  Purchase: 'purchase',
};
export function track(event: string, data: any = {}) {
  if (localStorage.getItem('okpora_analytics') !== 'accepted') return;
  initAnalytics();
  window.gtag?.('event', ga[event] || event, data);
  window.fbq?.('track', event, data);
  window.ttq?.track(event === 'Purchase' ? 'CompletePayment' : event, data);
}
export function purchase(order: any) {
  if (order.payment_status !== 'paid') return;
  const key = 'okpora_purchase_' + order.id;
  if (localStorage.getItem(key)) return;
  track('Purchase', { transaction_id: order.number, value: order.total / 100, currency: order.currency });
  if (localStorage.getItem('okpora_analytics') === 'accepted') localStorage.setItem(key, '1');
}

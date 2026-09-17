export const appConfig = {
  apiBase: '/api',
  siteUrl: import.meta.env.VITE_SITE_URL || window.location.origin,
  storeName: import.meta.env.VITE_STORE_NAME || 'Okpora',
  analytics: {
    google: import.meta.env.VITE_GOOGLE_ANALYTICS_ID || '',
    meta: import.meta.env.VITE_META_PIXEL_ID || '',
    tiktok: import.meta.env.VITE_TIKTOK_PIXEL_ID || '',
  },
};
export const fallbackStore = {
  name: appConfig.storeName,
  currency: 'NGN',
  announcement: 'Considered essentials. Everyday favourites.',
  hero_title: 'Good things.\nEvery day.',
  hero_text: 'Discover thoughtful pieces for the way you live. A little style, a little comfort, all yours.',
  hero_image: '/hero.jpg',
  hero_label: 'THE EVERYDAY EDIT',
  footer: 'Considered essentials for everyday living.',
  email: '',
  phone: '',
  address: '',
  whatsapp: '',
  instagram: '',
  facebook: '',
  about: '',
  faqs: [],
  tax_percent: 0,
};

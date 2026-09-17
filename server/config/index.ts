import 'dotenv/config';

export const config = {
  databaseUrl: process.env.DATABASE_URL || '',
  databaseCa:
    process.env.DATABASE_CA_CERT ||
    (process.env.DATABASE_CA_CERT_BASE64
      ? Buffer.from(process.env.DATABASE_CA_CERT_BASE64, 'base64').toString('utf8')
      : ''),
  siteUrl: (process.env.SITE_URL || 'http://localhost:5173').replace(/\/$/, ''),
  production: process.env.NODE_ENV === 'production' || !!process.env.NETLIFY,
  provider: process.env.PAYMENT_PROVIDER || 'paystack',
  paystackSecret: process.env.PAYSTACK_SECRET_KEY || '',
  flutterwaveSecret: process.env.FLUTTERWAVE_SECRET_KEY || '',
  flutterwaveHash: process.env.FLUTTERWAVE_WEBHOOK_SECRET || '',
  flutterwaveMode: process.env.FLUTTERWAVE_WEBHOOK_MODE || 'legacy',
  stripeSecret: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhook: process.env.STRIPE_WEBHOOK_SECRET || '',
  resendKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || '',
  adminEmail: process.env.ADMIN_NOTIFICATION_EMAIL || '',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  storageBucket: process.env.STORAGE_BUCKET || 'product-images',
  adminEmailBootstrap: process.env.ADMIN_EMAIL || '',
};

export function missingConfig(scope = 'core') {
  const missing: string[] = [];

  if (!config.databaseUrl) missing.push('DATABASE_URL');
  if (config.production && !config.siteUrl.startsWith('https://')) {
    missing.push('SITE_URL (HTTPS required)');
  }

  if (scope === 'payment' || scope === 'all') {
    if (!['paystack', 'flutterwave', 'stripe'].includes(config.provider)) {
      missing.push('PAYMENT_PROVIDER');
    }
    if (config.provider === 'paystack' && !config.paystackSecret) {
      missing.push('PAYSTACK_SECRET_KEY');
    }
    if (config.provider === 'flutterwave') {
      if (!config.flutterwaveSecret) missing.push('FLUTTERWAVE_SECRET_KEY');
      if (!config.flutterwaveHash) missing.push('FLUTTERWAVE_WEBHOOK_SECRET');
    }
    if (config.provider === 'stripe') {
      if (!config.stripeSecret) missing.push('STRIPE_SECRET_KEY');
      if (!config.stripeWebhook) missing.push('STRIPE_WEBHOOK_SECRET');
    }
  }

  if (scope === 'email' || scope === 'all') {
    if (!config.resendKey) missing.push('RESEND_API_KEY');
    if (!config.emailFrom) missing.push('EMAIL_FROM');
  }

  return missing;
}
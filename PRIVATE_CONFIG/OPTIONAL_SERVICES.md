# Optional services

Only variables in `.env.example` are consumed by this release.

| Feature | State and extension point |
| --- | --- |
| Supabase product image uploads | Implemented; configure SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and STORAGE_BUCKET |
| WhatsApp contact | Implemented as a public click-to-chat number in Admin contact settings |
| WhatsApp business notifications | Add an outbox adapter; future WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID |
| SMS | Add a notification adapter; future SMS_PROVIDER, SMS_API_KEY and SMS_SENDER_ID |
| Web push | Add subscription storage, a service worker and VAPID keys |
| Social login | Add trusted OAuth provider, PKCE/state validation and server-side session exchange |
| Abandoned-cart messages | Add a consent-aware scheduled worker over carts/orders |
| Recommendations | Category-related products implemented; personalized ranking is an extension |
| Referrals / loyalty | Add transactional referral/credit ledgers |
| Multiple currencies | One configured two-decimal currency implemented; add explicit currency prices and reporting |
| Multiple warehouses | One stock ledger per variant; add warehouse allocation and stock tables |
| Multiple admins | Implemented; super admin manages customer/admin/super_admin roles |
| Granular staff permissions | Add permission tables and backend checks beyond the three roles |
| Other email providers | Resend implemented; preserve the outbox when adding SMTP/SES/SendGrid/Mailgun adapters |

Unsupported services are not silently simulated. Centralize future secret reads in server/config/index.ts and document their variables here. Never prefix secrets with VITE_. Test money, inventory and authorization extensions.

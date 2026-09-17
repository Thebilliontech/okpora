# Analytics setup

Optional public browser IDs (Netlify Builds scope):

```dotenv
VITE_GOOGLE_ANALYTICS_ID=
VITE_META_PIXEL_ID=
VITE_TIKTOK_PIXEL_ID=
```

Set only platforms you use, then redeploy. Tags load only after the visitor accepts optional analytics. Cookie preferences can be reopened in the footer. Refusing analytics does not stop shopping.

| Store event | Google Analytics | Meta | TikTok |
| --- | --- | --- | --- |
| ViewContent | view_item | ViewContent | ViewContent |
| Search | search | Search | Search |
| AddToCart | add_to_cart | AddToCart | AddToCart |
| InitiateCheckout | begin_checkout | InitiateCheckout | InitiateCheckout |
| Purchase | purchase | Purchase | CompletePayment |

Purchase fires only after backend payment verification, with a per-order browser deduplication marker. Values are major currency units. Ad blockers, refused consent, cross-device use and closed return pages affect attribution; database payments are the financial source of truth. Server-side conversions APIs are not implemented.

Test events in each platform's official debug tools with a test checkout. Check your account's current pixel and parameter requirements. The Content Security Policy allows the configured tag hosts; add specific additional hosts only if your platform needs them. Apply consent and privacy requirements for your business's actual jurisdictions.

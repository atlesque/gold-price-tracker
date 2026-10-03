# Gold Price Tracker

A minimal single-page gold-price tracker for **gold.atlesque.dev**: an Au mark, a prominent EUR/kg price, market status, and one luminous Three.js ingot. No taglines, creator branding, copyright, or information sections. Locally hosted fonts and responsive framing keep the price clear on desktop and mobile.

Drag with a mouse or touch to freely rotate the ingot. The arrow keys also rotate it; Home restores its initial orientation. Subtle idle rotation stops after interaction. Bloom and metallic reflections give it a warm glow. Animation pauses in hidden tabs and respects reduced-motion preferences. Price provenance and retrieval time are available in the market-status tooltip and to assistive technology.

The ingot uses the published **116 × 51 × 9.2 mm** (length × width × thickness) dimensions of a [Heraeus 1 kg cast gold bar](https://www.heraeus-precious-metals.com/en/precious-metal-trading/precious-metals-as-investment/precious-metal-bars/trd-ps-detail/85100015-DE/), uniformly scaled to fit the scene. Dimensions vary by manufacturer: [Argor-Heraeus](https://www.argor-heraeus.com/en/products-and-services/products/cast-and-minted-bars/1000g-au-cast-classic-999.9/) lists 117.5 × 52 × 9 mm, while [The Perth Mint](https://www.perthmint.com/shop/bullion/cast-bars/1-kilo-gold-cast-bar/) lists maximum dimensions of 112 × 52 × 9 mm. References checked on 3 October 2026. Edge rounding and the generic Au face artwork are visual treatments rather than an exact reproduction of a branded bar.

The reference-inspired cast shape has rounded corners and a softly beveled rim. A procedural height map gives the Au, FINE GOLD, 999.9, and 1000 g lettering recessed shoulders that reflect the scene lighting as the bar rotates, with a subtle cast surface finish. Only the upper face is stamped; the underside remains plain gold.

## How it works

- Static files run on Cloudflare Pages. Only `/api/*` invokes a Pages Function.
- The Function calls a separate Worker’s SQLite-backed Durable Object, using the same named object for every visitor. A single global gold quote is intentionally the coordination unit.
- On an expired cache, exactly one refresh race starts. Concurrent requests await that same result. The quote is cached for **60 seconds after the successful fetch finishes**. The next visitor after expiration triggers the next refresh.
- There are no cron triggers, alarms, background price timers, or upstream requests without visitors. Hidden browser tabs stop price polling and 3D animation. The browser resumes only when visible.
- Both upstreams are requested concurrently; the **first valid price**, rather than the first HTTP response, wins. The losing request is aborted. Each race has a nine-second timeout and bounded response bodies.
- The latest successful quote and next attempt timestamp persist. During failures, return the last quote with `stale: true`; cold failures return HTTP 503 without a made-up price. Failed races have a persisted 60-second retry cooldown.
- Weekend closure uses Friday 17:00 to Sunday 18:00 **America/New_York**, including daylight saving. The daily 17:00–18:00 break is also respected. The market-status tooltip displays reopening in Brussels time. Provider-specific holidays and exceptional exchange closures are not modeled; these are indicative reference quotes, not an exchange execution feed.
- A warm cache stays frozen while the market is closed. If the app has never fetched a quote, the first closed-market visitor bootstraps the last available quote **once**, then it stays frozen through reopening. A deployment without weekend visitors makes no fetch.

## Verified sources

1. **Argentor** — The supplied [product page](https://www.argentorshop.be/nl/goudstaaf-100-gram-good-delivery-umicore) exposes a public `/graphql` bullion feed. Its `metalPrices(currency: EUR, weight: KG, metal: GOLD, timeInterval: HOUR, nTimeBack: 1)` result nevertheless contains **EUR per troy ounce**. The page’s `updateLastPricesText()` converts with `1000 / 31.1034768`; this app follows that conversion. The retail product price is never used.
2. **Testaankoop** — The [calculator page](https://www.test-aankoop.be/invest/rekenmodules/goudprijscalculator) contains a EUR/gram rate in the first `input-conversion` option, identified as **24K(999)**. Multiply by 1000 and divide by 0.999 to normalize to pure gold. This is a London reference rate, which may be delayed; checking it every minute does not imply its underlying benchmark changes every minute. The page does not provide a quote timestamp; the status tooltip explicitly labels our retrieval time.

GOLD.co.uk was inspected but returned an automated-request challenge. It is excluded rather than making every refresh contact an unusable endpoint. Both chosen sources were retrieved and validated on 3 October 2026. Source markup/API changes can require adapter updates.

## Development

Requires Node.js 22+ and npm.

```sh
npm ci
npm run types
npm run dev:worker  # local Worker on localhost:8797
npm run dev         # frontend URL printed by Vite; proxies API to the Worker
```

For a production-like Pages preview, build the frontend, keep the local Worker running, and run `npm run dev:pages`. Wrangler resolves the external Durable Object through its local registry. No source API keys are required. If an inspector port is already occupied, pass a distinct `--inspector-port`.

```sh
npm test
npm run build
npx wrangler deploy --config worker/wrangler.jsonc --dry-run
```

Tests cover concurrent requests, demand-only expiration, fetch-completion TTL, persisted cooldown, weekend bootstrap and freeze, failures, unit normalization, invalid source responses, first-valid response racing, daily breaks, and daylight-saving transitions.

## Current deployment

Published and redesigned on 3 October 2026 at **https://atlesque-gold.pages.dev/**. The Pages Function and deployed cache Worker were verified together against the real upstreams. Desktop and mobile browser checks passed, including free drag rotation, keyboard rotation/reset, and reduced-motion animation stopping. The production build and 18 automated tests pass. The custom domain **gold.atlesque.dev** is attached; the last domain check reported `CNAME record not set`, so it awaits the DNS record below. The deployment OAuth credential does not have DNS read/edit permission.

## Deployment

The account configuration is for Alexander’s existing Cloudflare account. Authenticate using `npx wrangler login` if needed.

```sh
npm run deploy:worker
npx wrangler pages project create atlesque-gold --production-branch main
npm run deploy:pages
node scripts/cloudflare-domain.mjs inspect
node scripts/cloudflare-domain.mjs attach
node scripts/cloudflare-domain.mjs dns
node scripts/cloudflare-domain.mjs status
```

Create the Pages project only once. The domain helper uses the existing Wrangler OAuth credential or `CLOUDFLARE_API_TOKEN` without printing credentials. Creating DNS records requires DNS edit permission; if the Wrangler OAuth credential lacks it, use the Cloudflare dashboard to create a proxied `CNAME gold.atlesque.dev → atlesque-gold.pages.dev`. The helper refuses to overwrite a different existing record.

Both Pages and SQLite Durable Objects are available on the free plan. Static Pages asset requests do not use the Functions quota; API calls and Durable Object activity count against Cloudflare’s account-wide free limits. No paid services or plan upgrades are required. See [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/) and [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/). The app does not enable billing upgrades.

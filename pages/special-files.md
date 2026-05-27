# Special Files & Endpoints

> These are non-page files and utility endpoints that support SEO, PWA functionality, monitoring, and social sharing.

---

| Path | Type | Purpose | Update Frequency |
|------|------|---------|-----------------|
| `/sitemap.xml` | Generated (Next.js `app/sitemap.ts`) | Static routes + dynamic blog posts from Payload API. Submitted to Google Search Console. | On build + ISR |
| `/robots.txt` | Generated | AI crawlers explicitly allowed (GPTBot, Claude-Web, PerplexityBot, Googlebot-Extended, Applebot, etc.). Disallows `/admin/`, `/api/`, `/profile/`. | Static |
| `/llms.txt` | Static or API-driven | AI agent discovery: site description, key pages, services, contact, API endpoints. Emerging standard. | Updated when services/prices change |
| `/llms-full.txt` | Static or API-driven | Extended version: complete service menu with prices, staff specializations, full booking instructions. | Updated when services change |
| `/manifest.json` | Static | PWA manifest: Royal Glow branding, theme colour (`#gold`), icons (192px, 512px), start_url: `/`, display: `standalone` | Rarely |
| `/sw.js` | Generated (next-pwa or custom) | Service worker: caches service menu, prices, contact page, hours, gallery thumbnails, homepage shell. Enables offline access to cached content. | On build |
| `/opengraph-image` | Generated (Next.js OG image generation) | Default branded OG image for social sharing. Royal Glow logo + tagline on brand background. | Static |
| `/favicon.ico` | Static | 32x32 favicon | Never |
| `/apple-icon.png` | Static | 180x180 Apple homescreen icon for iOS PWA | Never |
| `/api/health` | API route | Health check endpoint monitored by BetterStack. Returns: `{ status: 'ok', db: 'connected', redis: 'connected', timestamp }` | Always live |

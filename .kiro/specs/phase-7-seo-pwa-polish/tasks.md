# Implementation Plan: Phase 7 — SEO, PWA & Polish

## Overview

Make the public site discoverable, installable, and compliant: canonical business facts + JSON-LD builders, `sitemap.ts`/`robots.ts`, live `llms.txt`/`llms-full.txt`, a dependency-free PWA layer (manifest + service worker + offline page), a two-tier cookie-consent banner, consent-gated analytics (Meta Pixel + PostHog), the SSG legal pages, and per-page metadata + JSON-LD wiring. No schema changes; the only data reads are the existing `getAllServicesGrouped()` / `getActiveOffers()` queries. Analytics are consent-gated AND key-guarded, so the whole phase builds, typechecks, and runs with no keys. Verification uses `SKIP_ENV_VALIDATION=1 bun run typecheck` and `bun run lint` (Biome).

## Tasks

- [x] 1. Canonical business facts + SEO foundation libs
  - Create `apps/web/src/lib/seo/business.ts`: a single typed `BUSINESS` constant holding the exact NAP, geo (lat 12.877734987033477 / lng 77.66642516860671), `hasMap` plus code, opening hours (Mon–Fri 10:00–21:00, Sat–Sun 10:00–22:00), `priceRange` `₹₹₹`, payment methods, currencies, `amenityFeature` list, `knowsAbout`, email `hello@theroyalglow.in`, and socials — all values verbatim from `seo.md` Part 1/2. Export `SITE_URL` derived from `process.env.NEXT_PUBLIC_APP_URL` with fallback `https://theroyalglow.in` (read via `process.env` to stay build-safe), and a shared `FAQS` constant (the Part 7 question/answer list) and `SOCIAL_LINKS`
  - Create `apps/web/src/lib/seo/jsonld.ts`: pure builders returning plain objects — `localBusinessJsonLd()` (`@type` array `['LocalBusiness','BeautySalon','DaySpa']`, all fields from `BUSINESS`), `organizationJsonLd()`, `websiteJsonLd()` (with `potentialAction` SearchAction), `breadcrumbJsonLd(items)`, `serviceJsonLd({name,description,pricePaise,slug})` (Offer `priceCurrency:'INR'`, price = whole-rupee string from paise, provider LocalBusiness), `faqPageJsonLd(faqs)`
  - Create `apps/web/src/lib/seo/metadata.ts`: `buildMetadata({title,description,path,images?,robotsIndex?})` → Next `Metadata` (title with ` | Royal Glow Salon & Spa` suffix, canonical `SITE_URL + path` with no double slashes, OpenGraph `locale:'en_IN'` type website, Twitter `summary_large_image`, robots index per arg defaulting true)
  - Create `apps/web/src/components/seo/JsonLd.tsx` (server component): renders `<script type="application/ld+json">` via `dangerouslySetInnerHTML` with `JSON.stringify(data).replace(/</g,'\\u003c')` so it cannot break out of the script tag
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1, 3.2, 3.3_

- [x] 2. Cookie consent core + analytics event helper
  - Create `apps/web/src/lib/consent/consent.ts`: `type ConsentState = { necessary: true; analytics: boolean; marketing: boolean; decided: boolean }`; `getConsent()` (read `localStorage` key `rgss_cookie_consent`, SSR-safe — returns `{necessary:true,analytics:false,marketing:false,decided:false}` when unset or no `window`); `setConsent(partial)` (persist with `necessary:true`+`decided:true`, dispatch `CONSENT_EVENT`); export `CONSENT_EVENT = 'rgss:consent-change'`. Pure/guarded — no `window` access at module top level
  - Create `apps/web/src/lib/analytics/events.ts`: typed `track(event, props?)` that forwards to PostHog/Pixel only if loaded (reads module-level loaded flags / `window` globals guarded), else no-op without throwing; export the funnel event name union (`PageView`, `Lead`, `InitiateCheckout`, `Booking`, etc.)
  - _Requirements: 5.1, 5.4_

- [x] 3. PWA assets — manifest, service worker, offline page, registrar
  - Create `apps/web/src/app/manifest.ts` (Next `MetadataRoute.Manifest`): name `Royal Glow Salon & Spa`, short_name `Royal Glow`, description, `start_url:'/'`, `display:'standalone'`, theme/background colours (Royal Glow tokens — cocoa-dark / canvas-white), `icons` referencing `/icons/icon-192.png`, `/icons/icon-512.png` (+ a maskable entry)
  - Create `apps/web/public/sw.js`: dependency-free worker — versioned cache name; `install` pre-caches the app shell + `/offline` then `skipWaiting`; `activate` purges old caches + `clients.claim`; `fetch` handles navigation requests only (network-first, fall back to cached `/offline`), and explicitly **ignores** (returns without intercepting) any request whose path starts with `/api`, `/admin`, or auth routes, and non-GET requests
  - Create `apps/web/src/app/(customer)/offline/page.tsx`: static branded "You're offline" page with phone number (from copy) and a retry hint; `buildMetadata` with `robotsIndex:false`
  - Create `apps/web/src/components/pwa/ServiceWorkerRegistrar.tsx` (`'use client'`): registers `/sw.js` on `window load` in production only; no-ops when `serviceWorker` unavailable; swallows registration errors
  - Add a `apps/web/public/icons/README.md` documenting the required icon/OG sizes (asset manifest; raster art is a design deliverable)
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 4. Consent banner + consent-gated analytics loader
  - Create `apps/web/src/components/consent/CookieConsent.tsx` (`'use client'`): shows on first visit (when `!getConsent().decided`); "Accept all", "Reject non-essential", and a "Customise" disclosure with analytics + marketing switches → "Save selection"; accessible (`role="dialog"`/region, labelled controls, focusable, persists until a choice is made — Escape does NOT silently dismiss); calls `setConsent(...)`; re-openable via a `window` event the footer "Cookie Preferences" button can dispatch (export/handle an `open-preferences` signal)
  - Create `apps/web/src/components/analytics/Analytics.tsx` (`'use client'`): on mount + on `CONSENT_EVENT`, read consent — if `analytics` && `process.env.NEXT_PUBLIC_POSTHOG_KEY` → guarded dynamic import + init `posthog-js` (using `NEXT_PUBLIC_POSTHOG_HOST`); if `marketing` && `process.env.NEXT_PUBLIC_META_PIXEL_ID` → inject Meta Pixel snippet + fire `PageView`; both no-op when consent withheld or key absent; mark loaded flags consumed by `events.ts`. Use the established guarded-dynamic-import pattern (`posthog-js` need not be installed)
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 5. sitemap.ts / robots.ts / llms routes
  - Create `apps/web/src/app/sitemap.ts` (`MetadataRoute.Sitemap`): static entries (`/`, `/services`, `/about`, `/contact`, `/faq`, `/offers`, `/privacy`, `/terms`, `/refund-policy`) with priorities/changeFrequency per `seo.md` Part 3, plus a dynamic entry per active service slug from `getAllServicesGrouped()`; URLs built from `SITE_URL`; never includes `/admin`, `/api`, `/profile`, `/staff`, `/book`, `/sign-in`. Wrap the DB read in try/catch → static-only on error
  - Create `apps/web/src/app/robots.ts` (`MetadataRoute.Robots`): default agent `allow:'/'` with `disallow:['/admin/','/api/','/profile/','/staff/','/book']`; explicit allow rules for every AI crawler user-agent listed in `seo.md` Part 9 (Googlebot, Googlebot-Extended, Google-Extended, GPTBot, ChatGPT-User, PerplexityBot, Claude-Web, ClaudeBot, anthropic-ai, Bingbot, FacebookBot, Applebot, Applebot-Extended, CCBot, cohere-ai); `sitemap: SITE_URL + '/sitemap.xml'`
  - Create `apps/web/src/app/llms.txt/route.ts`: `GET` `text/plain` rendering the concise `seo.md` Part 8 template with live active service names from `getAllServicesGrouped()`; NAP from `BUSINESS`; `Cache-Control: public, max-age=3600`; try/catch → static fallback body with 200 on DB error
  - Create `apps/web/src/app/llms-full.txt/route.ts`: `GET` `text/plain` — full menu with prices (`formatINR(pricePaise)`) + durations, cancellation/reschedule policy, FAQ list; same caching + static fallback contract
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 6. Legal pages — `(legal)` route group (SSG)
  - Create `apps/web/src/app/(legal)/layout.tsx`: minimal chrome (logo / back-to-home link, footer NAP from `BUSINESS`), statically generated
  - Create `apps/web/src/app/(legal)/privacy/page.tsx`: real India-appropriate privacy copy with DPDP Act references, single `h1`, semantic sections, `buildMetadata` (indexable)
  - Create `apps/web/src/app/(legal)/terms/page.tsx`: terms of service copy, single `h1`, `buildMetadata` (indexable)
  - Create `apps/web/src/app/(legal)/refund-policy/page.tsx`: refund/cancellation policy copy, single `h1`, `buildMetadata` (indexable)
  - Each page: unique title + description, `robots: index, follow`
  - _Requirements: 6.1, 6.2_

- [x] 7. Wire root layout, footer, and per-page metadata + JSON-LD
  - Update `apps/web/src/app/layout.tsx`: set `metadataBase = new URL(SITE_URL)`, default title template `%s | Royal Glow Salon & Spa` + base description/OG, and mount `<Analytics />`, `<CookieConsent />`, `<ServiceWorkerRegistrar />` inside `<body>`
  - Update `apps/web/src/components/layout/Footer.tsx`: keep NAP sourced consistent with `BUSINESS` (no NAP drift); wire the existing "Cookie Preferences" button to dispatch the consent banner's `open-preferences` signal (`'use client'` only if needed — prefer a tiny client button wrapper to keep Footer a server component)
  - Add `generateMetadata`/`metadata` (via `buildMetadata`) + JSON-LD (`<JsonLd>`) to the public pages that exist: homepage (`LocalBusiness` + `Organization` + `WebSite` + `FAQPage`), services index (`BreadcrumbList` + `LocalBusiness` + `Service` items), about, contact, faq (`FAQPage`), offers — each with `BreadcrumbList` as applicable; ensure `/book` and any admin/staff/profile routes resolve `robots: noindex`
  - Confirm only the public pages that already exist are touched (do not invent pages); attach `Service` JSON-LD on the services index if per-slug pages don't exist yet
  - _Requirements: 1.1, 1.5, 3.1, 3.2, 3.3_

- [x] 8. Verification — typecheck and lint
  - Run `SKIP_ENV_VALIDATION=1 bun run typecheck` across the workspace; resolve all type errors in new files (no `any`, no `@ts-ignore` beyond a single justified guarded optional-dependency import if unavoidable)
  - Run `bun run lint` (Biome) and fix any genuine new issues (ignore the pre-existing CRLF/import-order/`useSemanticElements` baseline)
  - Confirm the build runs with NO analytics keys: consent banner works, Pixel/PostHog stay inert, llms routes return 200 with live or fallback bodies, sitemap/robots exclude private routes
  - _Requirements: 2.2, 4.3, 5.2, 5.3_

## Notes

- `seo.md` is the non-negotiable standard — NAP, JSON-LD shapes, robots AI-crawler list, and llms.txt templates must match it verbatim.
- Single source of truth: every NAP/hours/geo value comes from the `BUSINESS` constant. No hard-coded NAP strings elsewhere (footer/contact/llms/JSON-LD all read `BUSINESS`).
- Analytics are double-gated: user consent AND a configured `NEXT_PUBLIC_*` key. With neither, the build runs, the banner works, and no tracking fires. Read analytics keys via `process.env` directly behind truthy guards (guarded extension point); `posthog-js` is a guarded dynamic import so it need not be installed.
- JSON-LD is server-rendered only (via `<JsonLd>`); `<` escaped to `\u003c`. Data is from typed constants + DB service names, never user input.
- Service worker is dependency-free (no Workbox); never caches `/api`, `/admin`, or auth responses; navigation-only offline fallback. Registers in production only.
- Money is integer paise → Offer price as whole-rupee string; `llms-full.txt` uses `formatINR`. Dates DD/MM/YYYY where shown. Hours 24h in JSON-LD.
- No new DB tables; reads are `getAllServicesGrouped()` and `getActiveOffers()` only (public/no-auth). Routes wrap DB reads in try/catch with static fallback so they never 500.
- Icon/OG raster art is a documented asset manifest (`public/icons/README.md`) with stable paths; final PNG/AVIF is a design deliverable — manifest/metadata reference the stable paths now.
- No test files committed unless requested.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2", "3"] },
    { "id": 1, "tasks": ["4", "5", "6"] },
    { "id": 2, "tasks": ["7"] },
    { "id": 3, "tasks": ["8"] }
  ]
}
```

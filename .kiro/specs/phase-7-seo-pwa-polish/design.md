# Design Document — Phase 7: SEO, PWA & Polish

## Overview

Phase 7 makes the public site discoverable, installable, and compliant: structured data (JSON-LD), sitemap/robots, the `llms.txt` AI-discovery files, a Progressive Web App layer (manifest + service worker + offline), a two-tier cookie-consent banner, the SSG legal pages, and consent-gated analytics (Meta Pixel + PostHog).

It builds entirely on the public surfaces shipped in Phases 2–6. The work is overwhelmingly **presentation + metadata + static assets** — no new database tables, and the only data reads are the already-built `getAllServicesGrouped` / `getActiveOffers` queries (for the services sitemap entries, Service JSON-LD, and live `llms.txt`). Per the project rules, the SEO spec in `seo.md` is treated as a non-negotiable implementation standard.

Consistent with prior phases, third-party analytics scripts (Meta Pixel, PostHog) load **only after** the user opts in via the consent banner, and their keys are guarded extension points: with no keys configured the analytics layer is inert, the banner still works, and the build/typecheck pass.

### Goals

- Centralise canonical business facts (NAP, hours, geo, socials) in one typed constant and render full JSON-LD: `LocalBusiness`/`BeautySalon`/`DaySpa`, `Organization`, `WebSite`+`SearchAction`, `BreadcrumbList`, `Service` (with `Offer`), and `FAQPage`.
- Generate `app/sitemap.ts` (static routes + dynamic service slugs) and `app/robots.ts` (allow all AI crawlers, disallow admin/api/profile/book), each driven by `NEXT_PUBLIC_APP_URL`.
- Serve `llms.txt` and `llms-full.txt` as routes that pull live service/price data so they never go stale.
- Add a PWA: `manifest.webmanifest`, a service worker with an offline fallback page, registration, and install metadata — without breaking SSR or the existing booking flow.
- Add a 2-tier cookie-consent banner (necessary always-on; analytics/marketing opt-in) persisted to `localStorage`, exposing a consent state that gates analytics loading.
- Add the SSG legal pages (`/privacy`, `/terms`, `/refund-policy`) with proper metadata.
- Wire Meta Pixel + PostHog as consent-gated, key-guarded client components; expose a tiny typed event helper for the funnel events the funnel design references (PageView, Lead, etc.), no-op without consent/keys.
- Add per-page `generateMetadata` (title/description/OG/Twitter/canonical/robots) across the public pages, and a shared metadata helper.

### Non-Goals (deferred)

- **Blog/Gallery pages and their schemas** (`/blog`, `/gallery`, `ImageObject`, Payload CMS) — Phase 8.
- **`Review`/`AggregateRating` schema** — depends on real collected reviews (post-launch).
- **`Person` staff-profile pages** — no public staff pages exist yet; deferred with the gallery/about-team work.
- **Lighthouse CI enforcement** (SEO=100 gate in PRs) — Phase 9 (CI/CD). This phase builds *to* the standard; the CI gate is wired later.
- **Real Meta CAPI server events** — the browser Pixel is wired here (consent-gated); server CAPI stays the Phase-deferred extension point from Phase 4.
- **Actual icon/OG image asset production** — placeholder references + a documented asset manifest are provided; final PNG/AVIF art is a design deliverable. The manifest/meta reference stable paths under `/public`.

## Architecture

### New files

```
apps/web/src/lib/seo/business.ts        ← canonical NAP/hours/geo/socials constant (single source of truth)
apps/web/src/lib/seo/jsonld.ts          ← pure builders: localBusiness(), organization(), website(), breadcrumb(), service(), faqPage()
apps/web/src/lib/seo/metadata.ts        ← buildMetadata() helper (title/desc/OG/Twitter/canonical/robots)
apps/web/src/components/seo/JsonLd.tsx  ← server component: <script type="application/ld+json">
apps/web/src/app/sitemap.ts             ← Next 16 MetadataRoute.Sitemap (static + dynamic service slugs)
apps/web/src/app/robots.ts              ← Next 16 MetadataRoute.Robots (AI crawlers + disallows)
apps/web/src/app/llms.txt/route.ts      ← GET text/plain, live service summary
apps/web/src/app/llms-full.txt/route.ts ← GET text/plain, full menu + policies
apps/web/src/app/manifest.webmanifest/route.ts  ← (or app/manifest.ts) PWA manifest
apps/web/public/sw.js                   ← service worker (offline fallback + static cache)
apps/web/src/app/(customer)/offline/page.tsx    ← offline fallback page
apps/web/src/components/pwa/ServiceWorkerRegistrar.tsx  ← 'use client' registration
apps/web/src/components/consent/CookieConsent.tsx       ← 'use client' 2-tier banner
apps/web/src/lib/consent/consent.ts     ← consent read/write (localStorage) + types + event
apps/web/src/components/analytics/Analytics.tsx         ← 'use client' consent-gated Pixel + PostHog loader
apps/web/src/lib/analytics/events.ts    ← typed event helper (no-op without consent/keys)
apps/web/src/app/(legal)/layout.tsx     ← minimal legal chrome (SSG)
apps/web/src/app/(legal)/privacy/page.tsx
apps/web/src/app/(legal)/terms/page.tsx
apps/web/src/app/(legal)/refund-policy/page.tsx
```

Plus edits to: `app/layout.tsx` (mount consent banner, analytics, SW registrar, base metadata + metadataBase), the public page files (add `generateMetadata` + JSON-LD), and `env.ts`/`.env.example` (analytics keys already present — verify).

### Rendering rules (from seo.md)

- **JSON-LD is server-rendered** via the `JsonLd` server component embedded in each page's tree — never injected client-side.
- **Metadata** uses Next 16 `Metadata`/`generateMetadata`; `metadataBase` set once in the root layout so OG/canonical URLs resolve.
- **Analytics scripts load client-side, gated by consent** — the `Analytics` component reads consent state and only injects Pixel/PostHog when `analytics`/`marketing` consent is granted AND the relevant key is configured.
- **Service worker** is registered client-side after load; it caches the app shell + offline page and serves the offline page on navigation failure. It never caches API/auth responses.

### Consent gating flow

```
First visit → CookieConsent banner shows (necessary on, analytics/marketing off)
  │
  ├─ Accept all / Save selection → write { necessary:true, analytics:?, marketing:? } to localStorage
  │     → dispatch 'rgss:consent-change' event
  │           → Analytics component re-reads consent:
  │                analytics granted + POSTHOG key → load PostHog
  │                marketing granted + PIXEL id    → load Meta Pixel + fire PageView
  └─ Reject non-essential → only necessary; analytics stays inert
Subsequent visits → consent read from localStorage; banner hidden unless not yet chosen
```

## Components and Interfaces

### 1. Canonical business facts — `lib/seo/business.ts`

A single exported `BUSINESS` constant (typed) holding the exact NAP, hours, geo, price range, payment methods, amenities, socials, and `knowsAbout` from `seo.md`. Every JSON-LD builder, the footer, contact page, and `llms.txt` read from this so NAP stays identical everywhere. `SITE_URL` derives from `env.NEXT_PUBLIC_APP_URL` (falls back to `https://theroyalglow.in`).

### 2. JSON-LD builders — `lib/seo/jsonld.ts`

Pure functions returning plain objects (typed `Record<string, unknown>`), serialised by the `JsonLd` component:

```typescript
localBusinessJsonLd(): object        // ["LocalBusiness","BeautySalon","DaySpa"] from BUSINESS
organizationJsonLd(): object
websiteJsonLd(): object               // includes potentialAction SearchAction
breadcrumbJsonLd(items: {name; url?}[]): object
serviceJsonLd(s: { name; description; pricePaise; slug }): object  // Offer price in INR rupees
faqPageJsonLd(faqs: { question; answer }[]): object
```

`JsonLd.tsx` (server component): `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />`. Sanitisation: the data is built from typed constants/DB values, not user input; `JSON.stringify` output has `<` escaped to `\u003c` to be safe inside the script tag.

### 3. Metadata helper — `lib/seo/metadata.ts`

```typescript
buildMetadata(input: {
  title: string; description: string; path: string;
  images?: string[]; robotsIndex?: boolean;
}): Metadata
```
Produces title (` | Royal Glow Salon & Spa` suffix), description, canonical (`SITE_URL + path`), OpenGraph (`locale: 'en_IN'`, type website), Twitter (`summary_large_image`), and `robots`. The root layout sets `metadataBase = new URL(SITE_URL)`.

### 4. sitemap.ts / robots.ts

- `sitemap.ts`: static entries (`/`, `/services`, `/about`, `/contact`, `/faq`, `/offers`, legal pages) with priorities/changeFrequency per `seo.md`, plus a dynamic entry per active service slug from `getAllServicesGrouped()`. Excludes admin/api/profile/book/auth/staff.
- `robots.ts`: `rules` allowing `*` with `disallow: ['/admin/','/api/','/profile/','/staff/','/book']`, explicit allow rules for the AI crawler user-agents listed in `seo.md` Part 9, and `sitemap: SITE_URL + '/sitemap.xml'`.

### 5. llms.txt routes

Two `GET` route handlers returning `text/plain`. `llms.txt` renders the concise template from `seo.md` Part 8 with the live service catalogue (names) pulled from `getAllServicesGrouped()`. `llms-full.txt` adds the full menu with prices (formatted ₹ via `formatINR`), durations, the cancellation policy, and the FAQ list. Both read `BUSINESS` for NAP. `Cache-Control: public, max-age=3600`.

### 6. PWA layer

- `manifest.ts` (Next 16 `MetadataRoute.Manifest`): name, short_name, description, `start_url: '/'`, `display: 'standalone'`, theme/background colours (Royal Glow tokens), and `icons` referencing `/icons/icon-192.png` + `/icons/icon-512.png` (+ maskable). A documented `public/icons/README` lists the required sizes.
- `public/sw.js`: a minimal, dependency-free service worker — on `install` pre-cache the app shell + `/offline`; on `fetch` (navigation requests only) try network, fall back to the cached `/offline` page; **never** intercept `/api/*`, `/admin/*`, or auth requests. Versioned cache name; old caches purged on `activate`.
- `ServiceWorkerRegistrar.tsx`: registers `/sw.js` on `load` in production only; no-ops if `serviceWorker` is unavailable.
- `(customer)/offline/page.tsx`: a branded "You're offline" page (static), with the phone number and a retry hint.

### 7. Cookie consent — `lib/consent/consent.ts` + `components/consent/CookieConsent.tsx`

```typescript
type ConsentState = { necessary: true; analytics: boolean; marketing: boolean; decided: boolean }
getConsent(): ConsentState           // read localStorage 'rgss_cookie_consent'
setConsent(partial): void            // persist + dispatch 'rgss:consent-change'
CONSENT_EVENT = 'rgss:consent-change'
```
`CookieConsent.tsx`: shows on first visit (when `!decided`), offers "Accept all", "Reject non-essential", and a "Customise" toggle (analytics + marketing switches) → "Save". Accessible (role="dialog" / region, focusable controls, Escape dismiss = reject non-essential is NOT auto — banner persists until a choice is made). Persists choice; re-openable via a footer "Cookie preferences" link.

### 8. Analytics — `components/analytics/Analytics.tsx` + `lib/analytics/events.ts`

- `Analytics.tsx` (client, mounted in root layout): on mount + on `CONSENT_EVENT`, reads consent. If `analytics` && `NEXT_PUBLIC_POSTHOG_KEY` → init PostHog (guarded dynamic import of `posthog-js`). If `marketing` && `NEXT_PUBLIC_META_PIXEL_ID` → inject the Meta Pixel snippet + fire `PageView`. Both no-op if consent withheld or key absent. Uses the established guarded-dynamic-import pattern.
- `events.ts`: `track(event, props?)` — typed wrapper that forwards to PostHog/Pixel **only if** loaded; otherwise no-op. Exposes the funnel events (`Lead`, `InitiateCheckout`, `Booking`, etc.) used by the lead/booking flows. Wiring these into existing flows is light-touch and optional this phase (the helper exists; calls can be added where cheap).

### 9. Legal pages — `(legal)` route group

`(legal)/layout.tsx`: minimal chrome (logo, back-to-home, footer NAP) — SSG. Three pages (`privacy`, `terms`, `refund-policy`) are static server components with real, India-appropriate copy (DPDP Act references for privacy), each with `buildMetadata`, a single `h1`, semantic sections, and `robots: index, follow`. Linked from the footer.

### 10. Page metadata + JSON-LD wiring

- **Root layout**: `metadataBase`, default title template `%s | Royal Glow Salon & Spa`, mount `<Analytics />`, `<CookieConsent />`, `<ServiceWorkerRegistrar />`.
- **Homepage**: `buildMetadata` + `LocalBusiness` + `Organization` + `WebSite` + `FAQPage` JSON-LD (FAQs from a shared constant matching `seo.md` Part 7).
- **Services index**: metadata + `BreadcrumbList` + `LocalBusiness`.
- **Service detail** (`/services/[slug]` if present, else the services page per service): `Service` JSON-LD with Offer + `BreadcrumbList`. (If individual service pages don't exist yet, attach `Service` items on the services index and note the per-page upgrade for when slugs land.)
- **About / Contact / FAQ / Offers**: metadata + `BreadcrumbList` (+ `FAQPage` on FAQ). Contact uses `<address>` (already does) and adds geo.
- **Admin/staff/profile/book**: ensure `robots: noindex` (book already has it).

## Data Models

No schema changes. Reads only: `getAllServicesGrouped()` (sitemap, Service JSON-LD, llms files), `getActiveOffers()` (optional, for llms/offers). All public/no-auth.

## Money, Date & Currency Conventions

- Service prices in JSON-LD `Offer` use rupees as a string derived from integer paise (`(pricePaise/100).toFixed(0)` or `.toFixed(2)`), `priceCurrency: 'INR'`. `llms-full.txt` shows `formatINR(pricePaise)`.
- Hours rendered in 24h in JSON-LD `OpeningHoursSpecification` (per `seo.md`), 12h human text elsewhere.

## Error Handling

- SEO/PWA routes are static or read-only; the llms.txt routes wrap their DB read in try/catch and fall back to a static (no live menu) body on error so they never 500.
- Service worker fetch handler always resolves (network → cache → offline page); registration failures are swallowed.
- Analytics/consent failures are caught and logged; they never block render.

## Security Considerations

- **No secrets client-side**: only `NEXT_PUBLIC_*` analytics identifiers reach the browser (by design — they are publishable). Server keys are untouched.
- **Consent before tracking**: no Pixel/PostHog network call fires until explicit opt-in — DPDP-aligned.
- **JSON-LD injection**: data is from typed constants + DB service names (not user input); `JSON.stringify` with `<`→`\u003c` escaping prevents script-tag breakout.
- **Service worker scope**: never caches authenticated/API responses; only the public app shell + offline page, so no private data is persisted to the cache.
- **robots/sitemap** never expose admin/api/profile/staff/book URLs.

## Testing Strategy

Per coding standards, no test files committed unless requested. Verification per task:
- **Pure builders** (`jsonld.ts`, `metadata.ts`, `consent.ts` serialisation, `events.ts` no-op guards) — deterministic, strongest unit/PBT targets.
- **Routes** (`sitemap.ts`, `robots.ts`, `llms*.txt`, `manifest`) — typecheck; manual shape check of output.
- **Client components** (consent, analytics, SW registrar) — typecheck; reasoned through SSR-safety (no `window` at module top-level; guarded in effects).
- **Whole phase** — `SKIP_ENV_VALIDATION=1 bun run typecheck` and `bun run lint` (Biome) must pass.

## Design Decisions & Rationale

1. **Single source of truth for NAP** (`BUSINESS` constant). `seo.md` makes NAP consistency a hard ranking factor; centralising it guarantees the footer, contact page, JSON-LD, and llms files never drift.
2. **JSON-LD as pure builders + a server component.** Keeps structured data server-rendered (required by `seo.md`), testable, and free of client JS. Builders return plain objects so they're trivially unit-checked.
3. **Analytics strictly consent-gated and key-guarded.** Two independent gates (user consent + configured key) mean the build runs with neither, the banner works standalone, and no tracking fires pre-consent — satisfying DPDP and the project's guarded-extension-point convention.
4. **llms.txt served from live data.** `seo.md` explicitly wants prices current without manual edits; route handlers reading `getAllServicesGrouped()` achieve that, with a static fallback on DB error.
5. **Dependency-free service worker.** A hand-written `sw.js` (no Workbox) keeps the PWA lightweight, avoids a build-plugin dependency, and makes the cache/offline behaviour auditable. It explicitly excludes API/admin/auth from caching for safety.
6. **Legal pages as their own `(legal)` route group, SSG.** Distraction-free chrome, statically generated for speed and indexability; real DPDP-aware copy gives a genuine trust signal (E-E-A-T) rather than a placeholder.
7. **Icon/OG art deferred to a documented manifest.** Producing final raster art isn't a code task; referencing stable `/public` paths + a sizes manifest lets the manifest/metadata be correct now and the art dropped in later without code change.
8. **Per-page `generateMetadata` via one helper.** Avoids copy-paste drift across pages and guarantees every public page meets the `seo.md` per-page checklist (title/desc/OG/canonical/robots).

## Correctness Properties

### Property 1: NAP is identical everywhere
Every JSON-LD builder, the footer, the contact page, and both llms files derive their name/address/phone from the single `BUSINESS` constant — there is no hard-coded NAP string elsewhere.
**Validates: Requirements 1.1, 1.5**

### Property 2: LocalBusiness JSON-LD is valid and complete
`localBusinessJsonLd()` always returns an object with `@context: 'https://schema.org'`, a `@type` array containing `LocalBusiness`, and non-empty `name`, `address`, `telephone`, and `openingHoursSpecification` fields populated from `BUSINESS`.
**Validates: Requirements 1.1, 1.2**

### Property 3: Service Offer price is integral INR
`serviceJsonLd(s)` produces an `Offer` whose `priceCurrency` is `'INR'` and whose `price` equals the service's paise converted to a whole/centless rupee string (no floating-point artefacts).
**Validates: Requirements 1.3**

### Property 4: JSON-LD is script-tag safe
The serialised JSON-LD emitted by `JsonLd` never contains a raw `</script>` sequence — `<` is escaped — so it cannot break out of the `<script>` element.
**Validates: Requirements 1.4**

### Property 5: Sitemap excludes private routes
`sitemap.ts` output contains only public URLs and never includes any path under `/admin`, `/api`, `/profile`, `/staff`, `/book`, or `/sign-in`.
**Validates: Requirements 2.2**

### Property 6: Robots allows AI crawlers and blocks private areas
`robots.ts` output disallows `/admin/`, `/api/`, `/profile/`, `/staff/`, and `/book` for the default agent, includes allow rules for the named AI crawler user-agents, and references the sitemap URL.
**Validates: Requirements 2.1, 2.3**

### Property 7: Canonical URLs are absolute and correct
`buildMetadata({ path })` sets `alternates.canonical` to exactly `SITE_URL + path` with no double slashes, and sets `robots.index` per the `robotsIndex` argument (default true).
**Validates: Requirements 3.2, 3.3**

### Property 8: No tracking before consent
`track(event)` and the `Analytics` loader perform no network/provider call unless consent for the relevant category is granted AND the relevant `NEXT_PUBLIC_*` key is present; otherwise they are no-ops.
**Validates: Requirements 5.2, 5.3, 5.4**

### Property 9: Consent persists and round-trips
`setConsent(p)` followed by `getConsent()` returns a state reflecting `p` with `necessary: true` always and `decided: true`; an unset store returns `decided: false`.
**Validates: Requirements 5.1**

### Property 10: Service worker never caches private responses
The `sw.js` fetch handler ignores (does not cache or serve from cache) any request whose path starts with `/api`, `/admin`, or the auth routes; only navigation requests get the offline fallback.
**Validates: Requirements 4.3**

### Property 11: llms.txt reflects live services and never 500s
The `llms.txt`/`llms-full.txt` routes include the current active service names from the database, and on a DB read error fall back to a static body with a 200 response (never an error status).
**Validates: Requirements 2.4**

### Property 12: Legal pages are indexable with unique metadata
Each of `/privacy`, `/terms`, `/refund-policy` returns `robots: index, follow`, a unique title and description, and a single `h1`.
**Validates: Requirements 6.1, 6.2**

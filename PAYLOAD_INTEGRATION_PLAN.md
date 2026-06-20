# Payload CMS → Website Integration Plan (Handoff Document)

**Project:** theroyalglow-webapp (Royal Glow Salon & Spa)
**Goal:** Let the owner/manager (non-technical) manage all marketing content of the
customer website (`localhost:3000` in dev, `theroyalglow.in` in prod) from the
Payload CMS admin (`localhost:3002/admin` in dev, `admin.theroyalglow.in` in prod) —
with **zero developer involvement** for day-to-day content changes.

This document is a complete, self-contained brief. Any agent can pick it up and
execute it end to end. Read it fully before writing code.

---

## 0. TL;DR — What we are building

Make these homepage / site sections fully CMS-driven (owner can do all CRUD from Payload):

| # | Section | Page/Component (web) | CMS collection | Status |
|---|---------|----------------------|----------------|--------|
| 1 | "See what Royal Glow can do for you" category cards | `ServicesSection.tsx` | `service-card` | collection exists, **not wired** |
| 2 | Services page (Salon vs SPA, with duration/price/Book) | `/services` `services-content.tsx` | `service` (NEW, detailed) | **build collection + wire** |
| 3 | Special Offers | `OffersSection.tsx` + `/offers` | `offer` | collection exists, **not wired** |
| 4 | Testimonials carousel | `TestimonialsSection.tsx` | `testimonial` | collection exists, **not wired** |
| 5 | FAQ | `/faq` + `FaqSection.tsx` | `faq` | collection exists, **already wired** (verify) |
| 6 | About → Team/Staff | `/about` `page.tsx` | `team` | collection exists, **not wired** |
| 7 | Announcement bar | `(customer)/layout.tsx` | `banner` | collection exists, **not wired** |
| 8 | Gallery | `/gallery` | `gallery` | collection + read fn exist, **verify wired** |
| 9 | Blog | `/blog` + `/blog/[slug]` | `blog` | **already wired** (verify) |

Each section must keep a **graceful fallback** (current hardcoded content or a clean
empty state) so the site never breaks if the CMS is down or empty.

---

## 1. Current State (what already exists — do not rebuild)

### 1.1 Monorepo layout
- `apps/web/` — Next.js 16 customer site (port 3000).
- `apps/cms/` — Payload CMS v3 (port 3002), Postgres (Neon) + R2 storage.
- Shared packages in `packages/*` (db, business, types, errors, logger).

### 1.2 CMS collections (in `apps/cms/src/collections/`)
Already defined and registered in `apps/cms/src/payload.config.ts`:
`Users`, `Media`, `Blog`, `Gallery`, `Team`, `Banner`, `Faq`,
`Testimonial`, `Offer`, `ServiceCard`.

- `Testimonial` — reviewerName, rating (1–5), reviewText, timeLabel, active, order.
- `Offer` — title, description, discountLabel, image, ctaLabel, ctaHref, category,
  active, validFrom, validUntil, order.
- `ServiceCard` — name, fromPrice (display string), image, imageAlt, bookingHref,
  active, order. (This powers the **homepage category cards**, not the detailed
  services page.)

Access control helpers live in `apps/cms/src/access/published.ts`
(`anyoneReads`, `anyoneReadsPublished`, `adminsWrite`). Reuse them.

### 1.3 Web → CMS read seam (in `apps/web/src/lib/cms/`)
**This is the architecture you MUST follow. Do not invent a new pattern.**

- `config.ts` — `cmsFetch<T>(path, { revalidate })`: a **total** guarded fetch.
  - Reads `process.env.NEXT_PUBLIC_CMS_URL` directly (NOT `@/env`) so the app
    builds/serves even with no CMS configured.
  - Returns `null` on unconfigured / network error / non-2xx / parse failure.
  - Applies Next.js ISR via `next: { revalidate }` (default `CMS_REVALIDATE_SECONDS = 3600`).
- `client.ts` — the single read seam. Every exported function is **total** (never
  throws; returns `[]` / `null` / a mock). It maps raw Payload docs into stable
  **view-models** using defensive coercion helpers (`asString`, `asNumber`,
  `resolveMedia`, etc.). **Payload's generated types must never leak past this file.**
  - Existing: `getPublishedPosts`, `getPostBySlug`, `getAllPostSlugs`,
    `getGalleryImages`, `getTeamMembers`, `getActiveBanners`, `getCmsFaqs`.
- `types.ts` — the view-model types (`ResolvedMedia`, `BlogListItem`, `BlogPost`,
  `GalleryImage`, `TeamMember`, `Banner`, `CmsFaq`). Add new view-models here.
- `media.ts` — `resolveMedia(doc)` → `ResolvedMedia | null` (absolute URL + alt + w/h).
- `richtext.ts` — `lexicalToHtml(doc.body)` for Lexical rich text.
- `faqs.ts` — `resolveFaqs()` = CMS FAQs first, static `FAQS` fallback. Already used.

### 1.4 Non-negotiable conventions (apply to ALL new code)
1. **Total functions** — CMS reads never throw; always return a safe value.
2. **Never import `payload` in the web app.** Map to view-models in `client.ts` only.
3. **ISR** — server components fetch via `client.ts`; default 1h revalidation.
4. **Graceful fallback** — every wired section keeps its current hardcoded content
   (or a designed empty state) when the CMS returns empty/null.
5. **File headers** — every new `.ts`/`.tsx` gets the full header block per
   `file-header-guide.md`. CSS files and config files are exempt.
6. **Quality gate** — `bun run typecheck` (both apps) + `bunx biome check ./src`
   must pass. Pre-commit runs `biome check --write` via lint-staged.
7. **Money/locale** — display prices as already authored strings (e.g. "₹500") for
   marketing cards; for the detailed `service` collection store paise integers and
   format with `formatINR` from `@rgss/business`. INR, en-IN, DD/MM/YYYY.
8. **Git** — Conventional Commits. Branch flow dev → test → pprd → prod.
   When asked, push the same commit to all four branches (fast-forward).
9. **Workspace package scope is `@rgss/*` (VERIFIED), NOT `@repo/*`.** The internal
   packages are `@rgss/business`, `@rgss/db`, `@rgss/errors`, `@rgss/logger`,
   `@rgss/types` (see each `packages/*/package.json`). The `@repo/*` imports shown in
   the steering docs (`coding-standards.md`, `database.md`) are **illustrative only** —
   always import from `@rgss/*`. `formatINR` and `formatDateIN` are re-exported from the
   `@rgss/business` package root (`packages/business/src/index.ts`), so
   `import { formatINR } from '@rgss/business'` is correct. Any new `@rgss/*` package the
   web app consumes must also be added to `transpilePackages` in
   `apps/web/next.config.ts` (it currently lists business/db/errors/logger/types).

---

## 2. Environment & Infrastructure prerequisites

Before wiring, confirm/set these (do NOT commit secrets):

### apps/web/.env.local
```
NEXT_PUBLIC_CMS_URL=http://localhost:3002   # dev. Prod: https://admin.theroyalglow.in
NEXT_PUBLIC_R2_PUBLIC_URL=<R2 public bucket base URL>   # e.g. https://media.theroyalglow.in
```
- `cmsFetch` is a no-op (returns null → fallbacks render) until `NEXT_PUBLIC_CMS_URL` is set.
- **`NEXT_PUBLIC_R2_PUBLIC_URL` is REQUIRED for images** (VERIFIED in `lib/cms/media.ts`):
  `resolveMedia()` absolutises relative Payload upload URLs against this host first, and
  only falls back to the CMS base URL if it is unset. Set it to the R2 public domain so
  uploaded media resolve to a CDN URL, not the CMS origin. This host must ALSO be added
  to `next.config.ts` `images.remotePatterns` (below).

### apps/cms/.env.local
```
DATABASE_URL=<Neon pooled connection>
PAYLOAD_SECRET=<32+ char secret>
PAYLOAD_PUBLIC_SERVER_URL=http://localhost:3002
WEB_APP_URL=http://localhost:3000           # used for CORS/CSRF
R2_BUCKET_NAME / R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY
```

### Shared secret for on-demand revalidation (see §5)
If you implement §5, add the SAME secret to BOTH apps so the CMS hook can authenticate
to the web revalidate route:
- `apps/web/.env.local`: `REVALIDATE_SECRET=<random 32+ char>`
- `apps/cms/.env.local`: `REVALIDATE_SECRET=<same value>` + `WEB_APP_URL` (already above)
  so the Payload hook knows where to POST.

### next.config.ts (apps/web) — image remote patterns  ⚠️ CURRENTLY MISSING
`next/image` must be allowed to load CMS/R2 images. The current `next.config.ts` has
**no `images` block at all** — it only sets `transpilePackages` and wraps the config with
`withSentryConfig`. You MUST add `images.remotePatterns` (and preserve both the existing
`transpilePackages` array and the `withSentryConfig` wrapper). Example:

```ts
const nextConfig: NextConfig = {
  transpilePackages: ['@rgss/business', '@rgss/db', '@rgss/errors', '@rgss/logger', '@rgss/types'],
  images: {
    remotePatterns: [
      // R2 public media host (matches NEXT_PUBLIC_R2_PUBLIC_URL)
      { protocol: 'https', hostname: 'media.theroyalglow.in' },
      // CMS host (fallback when media URLs are served from the CMS origin)
      { protocol: 'https', hostname: 'admin.theroyalglow.in' },
      // Dev CMS origin — only needed if you point next/image at localhost uploads
      { protocol: 'http', hostname: 'localhost', port: '3002' },
      // Mock fallbacks currently use Unsplash (see MOCK_POSTS in client.ts)
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
}
```
- Use the REAL hostnames once known; do not hardcode a wrong host. If you prefer plain
  `<img>` over `next/image`, `remotePatterns` is not required — but `next/image` is
  preferred for LCP/CLS (see §6).
- Note: the existing mock blog data (`MOCK_POSTS` in `client.ts`) references
  `images.unsplash.com`; keep that pattern if any page can render mock content.

### Migrations
After adding/altering collections, generate + run Payload migrations:
```
cd apps/cms
bunx payload migrate:create   # generates a migration from schema diff
bunx payload migrate          # applies it
bunx payload generate:types   # regenerates payload-types.ts
```

---

## 3. Feature work items (in execution order)

> For each feature: (a) add/confirm the CMS collection, (b) add a view-model type in
> `types.ts`, (c) add a total read function in `client.ts`, (d) convert the web
> component/page to a server component that fetches + falls back, (e) verify.

### FEATURE A — Testimonials (smallest; do first to validate the pattern)

**CMS:** `testimonial` collection (exists).

**types.ts** — add:
```ts
export type Testimonial = {
  reviewerName: string
  rating: number          // 1–5
  reviewText: string
  timeLabel: string
}
```

**client.ts** — add `getTestimonials()`:
- Fetch `/api/testimonial?where[active][equals]=true&depth=0&sort=order&limit=20`.
- Map defensively; clamp `rating` to 1–5; skip docs missing `reviewerName`/`reviewText`.
- Return `[]` on empty (caller falls back to current hardcoded array).

**web** — `apps/web/src/app/(customer)/_components/TestimonialsSection.tsx`:
- It is currently a **client** component (auto-advancing carousel using state).
  Refactor so the **data** is fetched on the server and passed in as a prop:
  - Create a server wrapper (e.g. keep `TestimonialsSection` as an async server
    component that calls `getTestimonials()`), and move the interactive carousel to a
    child client component `TestimonialsCarousel.tsx` that receives
    `testimonials: Testimonial[]` as a prop.
  - If `getTestimonials()` returns `[]`, pass the existing hardcoded array as fallback.
- Keep ALL existing carousel behaviour (scrollLeft-based auto-advance — do NOT
  reintroduce `scrollIntoView`, it hijacks page scroll; dot indicators;
  `items-baseline`/overflow fixes; pause on hover; reduced-motion).

**Acceptance:** Owner adds a review in Payload → appears on homepage within the ISR
window (or instantly via on-demand revalidation, §5). Empty CMS → hardcoded reviews show.

---

### FEATURE B — Special Offers

**CMS:** `offer` collection (exists).

**types.ts** — add:
```ts
export type Offer = {
  id: string
  title: string
  description: string
  discountLabel: string | null
  image: ResolvedMedia
  ctaLabel: string
  ctaHref: string
  category: string
  validUntil: string | null
}
```

**client.ts** — add `getActiveOffers(now = new Date())`:
- Fetch `/api/offer?where[active][equals]=true&depth=1&sort=order`.
- Filter by `[validFrom, validUntil]` window (reuse the `isWithinWindow` pattern
  already in `client.ts`, generalised to validFrom/validUntil).
- Require `title` + resolvable `image`; default ctaLabel "Book Now", ctaHref "/?book=1".

**web:**
- `OffersSection.tsx` (homepage): convert to async server component; fetch offers;
  render first N (e.g. 2–4). Fallback to the current two hardcoded offers if empty.
- `/offers` page (`apps/web/src/app/(customer)/offers/page.tsx`): list all active
  offers; optional category filter (Salon/SPA/etc.).
- CTA "Book Now" → existing booking deep-link `/?book=1` (or category-scoped, see §4).

**Acceptance:** Owner creates an offer with image + valid-until → shows on homepage and
/offers; auto-hides after validUntil; empty → hardcoded offers show.

---

### FEATURE C — Homepage service category cards ("See what Royal Glow can do for you")

**CMS:** `service-card` collection (exists). Owner adds Hair/Spa/Bridal/Nails (and any
new category) with name, fromPrice, image, bookingHref.

**types.ts** — add:
```ts
export type ServiceCardItem = {
  id: string
  name: string
  fromPrice: string
  image: ResolvedMedia
  imageAlt: string
  bookingHref: string
}
```

**client.ts** — add `getServiceCards()`:
- Fetch `/api/service-card?where[active][equals]=true&depth=1&sort=order`.
- Require `name`, `fromPrice`, resolvable `image`.

**web** — `ServicesSection.tsx`:
- Convert to async server component; fetch cards; fall back to current hardcoded array.
- Keep the existing layout exactly: snap-scroll row, hidden scrollbar, the minimal bare
  gold chevron affordance (NO white fade, NO circle — already finalised), card design.

**Acceptance:** Owner adds a "Grooming" card with image/price → appears in the scroll row.

---

### FEATURE D — Detailed Services (Salon vs SPA) with duration/price/Book  ★ biggest

This is the `/services` page where services are split into **Salon** and **SPA**, each
with multiple services showing a small image, name, **duration**, **price**, and a
**"Book this"** button that opens the booking dialog.

#### D.1 Architectural decision (READ CAREFULLY)
There is a Drizzle `service` table in `packages/db` used by the **booking engine**
(availability, paise pricing, staff assignment). The owner wants to manage the
**customer-facing services catalogue** from Payload. Recommended approach:

- **Payload `service` collection = source of truth for the DISPLAY catalogue** on
  `/services` (image, name, description, duration, price, type=salon|spa, book CTA).
- The **booking flow** continues to use its own data/availability. The "Book this"
  button passes a **service identifier** (slug or id) into the booking dialog so it can
  pre-select. Keep the booking engine's source of truth as-is unless the owner wants a
  full migration (out of scope here; flag it).
- If the booking dialog needs the service to exist in the Drizzle table, document the
  mapping (e.g. Payload `service.bookingRef` stores the Drizzle service id/slug). The
  owner sets `bookingRef` when creating a service. If empty, "Book this" opens the
  generic booking dialog pre-filtered to the type (salon/spa).

> Surface this decision to the product owner before building. Do not silently couple
> Payload services to the booking engine.

#### D.2 New CMS collection: `apps/cms/src/collections/Service.ts`
Slug: `service`. Access: `anyoneReads` / `adminsWrite`. `useAsTitle: 'name'`.
Fields:
- `name` (text, required)
- `type` (select, required): `salon` | `spa`
- `category` (select): Hair, Skin, Nails, Bridal, Massage, Facial, Grooming, … (extensible)
- `image` (upload → media, required) — small thumbnail
- `description` (textarea)
- `durationMinutes` (number, required) — display as "45 min"
- `pricePaise` (number, required) — store paise; display via `formatINR`. (Or a
  `priceDisplay` text if the owner prefers free-form. Prefer paise for consistency.)
- `bookingRef` (text, optional) — id/slug bridging to the booking engine (see D.1)
- `active` (checkbox, default true)
- `featured` (checkbox) — optionally surface on homepage
- `order` (number)

Register it in `payload.config.ts` (`collections: [...]`) and update the header count.

#### D.3 types.ts
```ts
export type Service = {
  id: string
  name: string
  type: 'salon' | 'spa'
  category: string | null
  image: ResolvedMedia
  description: string
  durationMinutes: number
  priceFormatted: string   // formatted in client.ts via formatINR(pricePaise)
  bookingRef: string | null
}
```

#### D.4 client.ts
`getServices(type?: 'salon' | 'spa')`:
- Fetch `/api/service?where[active][equals]=true&depth=1&sort=order`
  (+ `&where[type][equals]=...` when `type` given).
- Map; format price with `formatINR` from `@rgss/business`; require name+image+duration.

#### D.5 web — `/services` (`services-content.tsx` + `page.tsx`)
- Server-fetch salon + spa services; render the two groups with the existing
  Salon/SPA toggle UI.
- Each service card: image, name, duration ("45 min"), price ("₹1,499"), "Book this".
- "Book this" → open the booking dialog (see §4) with the service pre-selected.
- Fallback: keep current static services if CMS empty.

**Acceptance:** Owner adds/edits/deletes a SPA service in Payload → reflected on
/services; "Book this" opens booking dialog pre-selected; salon/spa split correct.

---

### FEATURE E — About → Team / Staff

**CMS:** `team` collection (exists). Read fn `getTeamMembers()` exists.

**web** — `apps/web/src/app/(customer)/about/page.tsx`:
- Convert (or extend) to async server component; call `getTeamMembers()`.
- Render the team/staff grid (photo, name, role, bio, specializations) where the
  team gallery currently is.
- Fallback: a tasteful empty state or the current static team if any.

**Acceptance:** Owner adds/removes a stylist/therapist in Payload → About page updates
with no code change. (This is the high-value feature the owner specifically called out:
staff change frequently.)

---

### FEATURE F — FAQ (verify only)

`resolveFaqs()` already does CMS-first + static fallback. Confirm `/faq` page and the
homepage `FaqSection.tsx` both render from `resolveFaqs()` (FaqSection currently has a
hardcoded question list — wire it to `resolveFaqs()` too, or pass FAQs down from the
page). Ensure FAQPage JSON-LD uses the resolved list.

**Acceptance:** Owner edits an FAQ in Payload → /faq and homepage FAQ update; JSON-LD matches.

---

### FEATURE G — Announcement bar (Banner)

The announcement strip in `apps/web/src/app/(customer)/layout.tsx` is hardcoded
("✨ NEW · Monsoon Glow offers…"). `getActiveBanners()` already exists.

- Make the customer layout (or a small server component it renders) call
  `getActiveBanners()` and render the first active banner's headline + ctaHref.
- Fallback: keep the current hardcoded text if no active banner.

**Acceptance:** Owner schedules a banner with start/end dates → shows only within window.

---

### FEATURE H — Gallery & Blog (verify only)

- `/gallery` should already use `getGalleryImages()`; `/blog` + `/blog/[slug]` use
  `getPublishedPosts`/`getPostBySlug`/`getAllPostSlugs`. Verify they render from CMS and
  fall back to mocks. Fix wiring if any page still uses static data.

---

## 4. Booking dialog integration ("Book this")

The site already has a booking dialog system (VERIFIED — exact current API below):
- `BookingDialogProvider` (`components/booking/BookingDialogProvider.tsx`) — a client
  context provider. It holds `const [isOpen, setIsOpen] = useState(false)` and exposes a
  hook **`useBookingDialog()` returning exactly `{ open, close, isOpen }`** — `open()`
  takes **no arguments today** and just sets `isOpen = true`. It renders
  `<BookingDialog isOpen={isOpen} onClose={close} />` after `children`.
- `BookingDialogTrigger` (`components/booking/BookingDialogTrigger.tsx`) — renders no UI;
  in a `useEffect` it reads `useSearchParams()` and calls `open()` when
  `searchParams.get('book') === '1'`. It does NOT read any `service`/`type` param yet.
- `BookingDialog.tsx` — the 4-step flow itself.
- Deep-link `/?book=1` opens the dialog (`?book=1&utm_source=...` adds attribution).

For service "Book this" buttons there are two implementation tiers:

**Tier 1 — ship immediately (no API change):** make "Book this" a link to `/?book=1`.
This opens the generic dialog. Zero risk, works today. The button can be a server-rendered
`<Link href="/?book=1">` so the services page stays a server component.

**Tier 2 — pre-select the service (requires a small, additive provider change):**
The current context cannot carry a pre-selection. To add it WITHOUT breaking callers:
1. Extend the context value to `{ open, close, isOpen, prefill }` where
   `open(prefill?: { serviceId?: string; type?: 'salon' | 'spa' })` stores the prefill in
   state before setting `isOpen = true`. Keep the zero-arg call working (prefill optional).
2. Pass `prefill` into `<BookingDialog prefill={prefill} ... />` and have the dialog
   pre-fill / skip its Salon-SPA + service step when a prefill is present.
3. Extend `BookingDialogTrigger` to also read `service` and `type` search params so the
   URL form `/?book=1&service=<slugOrId>&type=<salon|spa>` deep-links a pre-selected
   service (needed for shareable links and the offers CTA). Guard the `useEffect` deps.
4. The "Book this" button then either:
   - calls `useBookingDialog().open({ serviceId, type })` (client component button), OR
   - links to `/?book=1&service=<id>&type=<type>` (keeps server rendering).
   Prefer the URL form so the services list need not become a client component.

**Decision:** Build Tier 1 first so the feature ships, then layer Tier 2. Do NOT break the
existing 4-step flow or the zero-arg `open()` callers (Header "Book Now", etc.). Keep
`/book` (Meta-ad lead capture) untouched — it is a separate page from `/?book=1`.

---

## 5. Content freshness — on-demand revalidation (IMPORTANT for owner UX)

Default ISR is 1h, so owner edits won't show immediately. Add **on-demand
revalidation** so changes appear within seconds:

1. Web: add a route handler `apps/web/src/app/api/revalidate/route.ts` that calls
   `revalidatePath` / `revalidateTag` for the affected pages, protected by a shared
   secret (`REVALIDATE_SECRET`).
2. CMS: add Payload `afterChange`/`afterDelete` collection hooks that POST to the web
   app's `/api/revalidate` with the secret when content changes.
3. Tag CMS fetches (`next: { tags: [...] }`) so revalidation is surgical
   (e.g. tag `offers`, `services`, `testimonials`, `team`, `banner`, `faq`, `blog`).

If on-demand revalidation is deferred, document the 1h delay for the owner and keep ISR.

---

## 6. Cross-cutting requirements (do not skip)

- **Images:** prefer `next/image` with `images.remotePatterns` for the R2/CMS host
  (LCP/CLS, lazy-loading, responsive `sizes`). If using `<img>`, ensure width/height to
  avoid layout shift. `resolveMedia` already returns width/height when available.
- **Accessibility:** keep WCAG 2.1 AA — alt text from CMS (`imageAlt`, media alt),
  visible focus, semantic markup, `aria-live` for the testimonials carousel.
- **SEO:** Offers/Services can emit structured data (e.g. `Service`/`Offer` JSON-LD);
  keep existing FAQPage/LocalBusiness JSON-LD intact.
- **Performance:** all CMS reads on the server (RSC), ISR-cached; no client-side
  fetching of catalogue data. Lighthouse ≥95 perf, 100 a11y/SEO must hold.
- **Empty/error/loading states:** every section renders something sensible when CMS is
  empty or down (fallback content or a designed empty state). Never a blank section.
- **Validation in Payload:** required fields (image, name, price/duration), `min`/`max`
  on rating (1–5), sensible defaults, helpful `admin.description` on every field so the
  non-technical owner understands each input.
- **Access control / roles:** confirm only authenticated CMS users can write
  (`adminsWrite`), reads are public (`anyoneReads`) or published-only
  (`anyoneReadsPublished` for blog). If the owner/manager need distinct permissions,
  extend `Users` with roles and gate `access` accordingly.

---

## 7. Step-by-step execution order (recommended)

1. **Env + migrations:** set `NEXT_PUBLIC_CMS_URL`; run `payload migrate:create` +
   `migrate` + `generate:types` for the new `Service` collection.
2. **Feature A (Testimonials)** — validates the full server-fetch + fallback pattern on
   the smallest surface.
3. **Feature B (Offers).**
4. **Feature C (Service category cards).**
5. **Feature D (Detailed Services + booking pre-select)** — the big one.
6. **Feature E (Team/About).**
7. **Feature G (Banner / announcement bar).**
8. **Features F + H (FAQ, Gallery, Blog) — verify/fix wiring.**
9. **Feature in §5 (on-demand revalidation).**
10. **QA pass:** typecheck (web + cms), biome, Lighthouse, manual CRUD test of each
    collection from `localhost:3002/admin` → confirm `localhost:3000` reflects changes.
11. **Seed:** optionally add a Payload seed script with the current hardcoded content so
    the CMS starts populated (testimonials, the 2 offers, the 4 service cards, services,
    team). Until seeded, fallbacks render.

---

## 8. Definition of Done

- [ ] Owner can do full CRUD on testimonials, offers, service cards, services, team,
      FAQ, banner from `/admin` with no code changes, and the site reflects it.
- [ ] Every wired section has a graceful fallback (hardcoded content or empty state).
- [ ] "Book this" on a service opens the booking dialog (pre-selected where possible).
- [ ] No `payload` import in `apps/web`; all reads go through `lib/cms/client.ts` and
      return view-models; all read functions are total.
- [ ] `bun run typecheck` passes in BOTH `apps/web` and `apps/cms`.
- [ ] `bunx biome check ./src` clean (only pre-existing non-blocking warnings).
- [ ] Every new `.ts`/`.tsx` has the full file header per `file-header-guide.md`.
- [ ] On-demand revalidation works (or 1h ISR documented as accepted).
- [ ] Lighthouse: perf ≥95, a11y/SEO/best-practices = 100 on homepage, /services,
      /offers, /about, /blog.
- [ ] Changes committed (Conventional Commits) and pushed to dev → test → pprd → prod.

---

## 9. Key files reference (quick map)

**CMS (`apps/cms/src/`)**
- `payload.config.ts` — register collections here.
- `collections/{Testimonial,Offer,ServiceCard,Service,Team,Banner,Faq,Blog,Gallery,Media,Users}.ts`
- `access/published.ts` — `anyoneReads`, `anyoneReadsPublished`, `adminsWrite`.

**Web (`apps/web/src/`)**
- `lib/cms/config.ts` — `cmsFetch`, `isCmsConfigured`, `CMS_REVALIDATE_SECONDS`.
- `lib/cms/client.ts` — add `getTestimonials`, `getActiveOffers`, `getServiceCards`,
  `getServices` here (existing: posts, gallery, team, banners, faqs).
- `lib/cms/types.ts` — add view-models here.
- `lib/cms/media.ts`, `lib/cms/richtext.ts`, `lib/cms/faqs.ts`.
- `app/(customer)/_components/{ServicesSection,OffersSection,TestimonialsSection,FaqSection}.tsx`
- `app/(customer)/services/{page.tsx,services-content.tsx}`
- `app/(customer)/offers/page.tsx`, `app/(customer)/about/page.tsx`,
  `app/(customer)/gallery/page.tsx`, `app/(customer)/faq/page.tsx`,
  `app/(customer)/blog/*`
- `app/(customer)/layout.tsx` — announcement bar.
- `components/booking/{BookingDialog,BookingDialogProvider,BookingDialogTrigger}.tsx`

---

## 10. Guardrails / gotchas (learned on this project)

- Carousels: scroll the **container** (`element.scrollTo({ left })`), never
  `scrollIntoView` (it hijacks the whole page scroll).
- `overflow-x-auto` implies `overflow-y: hidden` — add `overflow-y-visible` + padding if
  cards lift on hover.
- SVG/asset filenames must be **lowercase** (Linux prod is case-sensitive).
- Keep the finalised homepage details intact: bare gold chevron on the services scroll
  (no fade/circle), baseline-aligned brand logo wall, hero headline two-line lockup,
  SCHWARZKOPF stays text-only in the brand wall.
- `next/font` Google fonts: function names are like `Big_Shoulders` (not
  `Big_Shoulders_Display`); verify exports before importing.
- Do not break the booking deep-link contract: `/?book=1` opens the dialog; `/book` is
  the separate Meta-ad lead page.

---

*End of plan. Build in the order of §7, honour §6 cross-cutting rules and §1.4
conventions, and finish against §8 Definition of Done.*

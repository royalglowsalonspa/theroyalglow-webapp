# Customer-Facing — Public Pages

> These 8 pages are accessible to everyone without authentication. They form the marketing, discovery, and content layer of Royal Glow Salon & Spa.

---

## 1.1 `/` — Homepage

| Property | Detail |
|----------|--------|
| **Title** | Home |
| **Purpose** | Premium brand landing page with a single conversion goal: open the booking dialog. |
| **Rendering** | SSR (dynamic — personalised CTA if signed in) |
| **SEO** | `<title>Royal Glow Salon & SPA — Premium Beauty in Bengaluru</title>` |
| **JSON-LD** | `LocalBusiness` + `Organization` + `WebSite` (with `SearchAction`) + `FAQPage` |
| **OG Image** | Custom branded default (`/opengraph-image`) |
| **Canonical** | `https://theroyalglow.in` |

**UI Components:**
- Hero section: full-bleed image/video background, Royal Glow wordmark, tagline, single "Book Now" button (primary CTA)
- Services preview: top 4–6 services as horizontal scroll cards linking to `/services`
- Offers banner: active promotion (if any) with countdown timer and CTA
- Testimonials/Reviews: embedded Google Maps review snippets (static at build, refreshed ISR)
- Gallery preview: 4–6 images in masonry grid linking to gallery section
- FAQ section: 6–8 common questions (rendered as accordions, `FAQPage` JSON-LD)
- Footer: NAP (name, address, phone), social links, legal links, "Cookie Preferences" link

**States:**
- Loading: skeleton shimmer on hero image, service cards placeholder
- Error: graceful degradation — static fallback hero, services still rendered from cache
- Empty: N/A (homepage always has content)

**Deep-link behaviour:**
- `/?book=1` → auto-opens the 4-step booking dialog on mount
- `/?book=1&utm_source=gmb` → opens dialog + sets acquisition source `gmb`
- `/?book=1&utm_source=walkin` → opens dialog + sets acquisition source `walkin`
- `/?book=1&leadId={id}` → opens dialog with lead context linked (post-lead-capture redirect)
- `/?book=1&service=[slug]` → opens dialog with service pre-selected in Step 3

**Mobile vs Desktop:**
- Mobile: hero image cropped for portrait, "Book Now" button sticky at bottom of viewport, services as horizontal swipe
- Desktop: full-width hero with parallax, "Book Now" in hero center + fixed header CTA

**Realtime:** None (static content)

**Analytics events:**
- PostHog: `page_view`
- Meta Pixel: `PageView` (auto via base code)
- Clarity: heatmap + scroll depth tracking

**Accessibility:**
- Skip-to-content link as first focusable element
- Hero CTA: `aria-label="Book an appointment at Royal Glow"`
- FAQ accordions: `aria-expanded`, `aria-controls` pattern
- All images: descriptive `alt` text

---

## 1.2 `/services` — Services

| Property | Detail |
|----------|--------|
| **Title** | Services |
| **Purpose** | Browse all services with prices. Primary discovery page for what Royal Glow offers. |
| **Rendering** | SSR (data from Neon via Cloudflare KV cache) |
| **SEO** | `<title>Services & Prices | Royal Glow Salon & SPA</title>` |
| **JSON-LD** | `LocalBusiness` + `BreadcrumbList` + `Service` schema per service + `FAQPage` (service FAQs) |
| **OG Image** | Services-specific branded image |
| **Canonical** | `https://theroyalglow.in/services` |

**UI Components:**
- Salon / SPA toggle filter (sticky on scroll): switches between Salon categories and SPA categories
- Category sections: collapsible accordion groups (Haircut & Styling, Facial & Skincare, etc.)
- Service cards: name, price (₹ GST-inclusive), duration badge, "Book This" mini-button
- SPA services with 60/90min variants: single card with duration toggle (not two cards)
- Price display: always formatted as `₹X,XXX.00` with "Incl. 18% GST" note
- "Book Now" floating CTA at bottom (mobile) / fixed in header (desktop)

**States:**
- Loading: skeleton cards (6 placeholders per category)
- Error: "Unable to load services. Please try again." with retry button
- Empty: N/A (services always seeded)

**Mobile vs Desktop:**
- Mobile: single column, categories as full-width accordions, sticky Salon/SPA toggle at top
- Desktop: two-column grid within each category, toggle as horizontal tabs

**Analytics events:**
- PostHog: `page_view`, `service_viewed` (on card expand/click)
- Meta Pixel: `ViewContent` with `content_name` = category name

**Data source:** `GET /api/services` (Cloudflare KV cached, 5-min TTL)

---

## 1.3 `/offers` — Offers & Combos

| Property | Detail |
|----------|--------|
| **Title** | Offers & Combos |
| **Purpose** | Active promotions with terms, validity dates, and linked services. |
| **Rendering** | SSR |
| **SEO** | `<title>Current Offers & Combos | Royal Glow Salon & SPA</title>` |
| **JSON-LD** | `LocalBusiness` + `BreadcrumbList` + `Event` (per active offer) |
| **Canonical** | `https://theroyalglow.in/offers` |

**UI Components:**
- Offer cards (stacked): offer name, type badge (% off / ₹ off / Combo), linked services list, validity date range, terms text
- "Book Now" CTA on each card (opens homepage booking dialog with offer context)
- Expired offers: hidden (not shown to customers)
- "One offer per customer per day" info banner at top

**States:**
- Loading: skeleton cards (3 placeholders)
- Empty: "No active offers right now. Check back soon!" with illustration
- Error: "Unable to load offers." with retry

**Mobile vs Desktop:**
- Mobile: single column stacked cards
- Desktop: 2-column grid

**Data source:** `offer` table filtered by `start_date <= now AND end_date >= now`

---

## 1.4 `/about` — About Us

| Property | Detail |
|----------|--------|
| **Title** | About Us |
| **Purpose** | Business story, team gallery, salon philosophy. Builds trust and E-E-A-T signals. |
| **Rendering** | ISR (1h revalidation — content from Payload CMS) |
| **SEO** | `<title>About Royal Glow Salon & SPA — Our Story</title>` |
| **JSON-LD** | `LocalBusiness` + `BreadcrumbList` + `Person` (per staff member shown) |
| **Canonical** | `https://theroyalglow.in/about` |

**UI Components:**
- Brand story section: founder narrative, mission statement (from Payload CMS)
- Team gallery: staff cards with photo, name, designation (Stylist/Therapist), specialization
- Salon images: interior/exterior gallery (Cloudflare R2 images via Next.js `<Image>`)
- Values/philosophy section: icons + short text

**States:**
- Loading: skeleton text blocks + image placeholders
- Error: fallback to last cached ISR version

**Content source:** Payload CMS REST API (`/api/pages/about`)

---

## 1.5 `/contact` — Contact

| Property | Detail |
|----------|--------|
| **Title** | Contact |
| **Purpose** | All contact methods, location, and enquiry form. Critical for local SEO. |
| **Rendering** | SSG (static — contact info rarely changes) |
| **SEO** | `<title>Contact & Location | Royal Glow Salon & SPA Bengaluru</title>` |
| **JSON-LD** | `LocalBusiness` (full, with `geo`, `openingHoursSpecification`) + `BreadcrumbList` |
| **Canonical** | `https://theroyalglow.in/contact` |

**UI Components:**
- Address block: wrapped in `<address>` HTML tag, full NAP
- Google Maps embed: interactive map with pin (Place ID based)
- Business hours table: `<time>` tags for each day
- Phone: click-to-call link (`tel:+916360135720`)
- Email: `mailto:hello@theroyalglow.in`
- Social links: Instagram, Facebook (icon buttons with `aria-label`)
- Enquiry/feedback form: name, email, message, submit button
- Directions CTA: "Get Directions" opens Google Maps app on mobile

**States:**
- Form: idle → submitting (spinner) → success ("Thanks! We'll get back to you.") → error (inline message)

**Mobile vs Desktop:**
- Mobile: map full-width above form, click-to-call prominent
- Desktop: map on right, contact info + form on left (2-column)

**Offline (PWA):** This page is cached by service worker — accessible without internet

---

## 1.6 `/blog` — Blog

| Property | Detail |
|----------|--------|
| **Title** | Blog |
| **Purpose** | Beauty & wellness articles for SEO content marketing and E-E-A-T. |
| **Rendering** | ISR (1h revalidation) |
| **SEO** | `<title>Beauty & Wellness Blog | Royal Glow Salon & SPA</title>` |
| **JSON-LD** | `LocalBusiness` + `BreadcrumbList` |
| **Canonical** | `https://theroyalglow.in/blog` |

**UI Components:**
- Article list: cards with featured image, title, excerpt (150 chars), publish date, read time
- Pagination or "Load More" button
- Category filter chips (if categories defined in Payload CMS)

**States:**
- Loading: skeleton article cards (6 placeholders)
- Empty: "No articles yet. Check back soon!" (unlikely post-launch)

**Content source:** Payload CMS REST API (`/api/posts?limit=12&page=X`)

---

## 1.7 `/blog/[slug]` — Blog Post

| Property | Detail |
|----------|--------|
| **Title** | `[Article Title] | Royal Glow Blog` |
| **Purpose** | Individual article page with rich structured data for Google. |
| **Rendering** | ISR (1h revalidation) |
| **SEO** | Dynamic `<title>` + `<meta description>` from Payload CMS fields |
| **JSON-LD** | `BlogPosting` + `BreadcrumbList` + `LocalBusiness` |
| **OG Image** | Per-post generated OG image (article title + Royal Glow branding) |
| **Canonical** | `https://theroyalglow.in/blog/[slug]` |

**UI Components:**
- Article header: title (h1), publish date (`<time>`), read time, author
- Rich text body: rendered from Payload CMS rich text field (headings, paragraphs, images, lists)
- Table of contents sidebar (desktop only — sticky)
- Related articles: 2–3 cards at bottom
- CTA banner: "Ready to experience this? Book Now →" linking to `/?book=1`

**States:**
- 404: "Article not found" with link back to `/blog`

---

## 1.8 `/faq` — FAQ

| Property | Detail |
|----------|--------|
| **Title** | FAQ |
| **Purpose** | Frequently asked questions — optimised for Google AI Overviews and FAQ rich results. |
| **Rendering** | SSG (static) |
| **SEO** | `<title>Frequently Asked Questions | Royal Glow Salon & SPA</title>` |
| **JSON-LD** | `FAQPage` + `BreadcrumbList` + `LocalBusiness` |
| **Canonical** | `https://theroyalglow.in/faq` |

**UI Components:**
- Question groups by topic (Booking, Services, Pricing, Membership, Cancellation)
- Accordion pattern: question as `<h3>`, answer revealed on click
- Each answer: 1–3 sentences, answer-first writing pattern (AI-optimised)
- "Still have questions?" CTA at bottom linking to `/contact`

**States:**
- Static — no loading/error states needed (SSG)

**Accessibility:**
- `aria-expanded` on each accordion trigger
- `aria-controls` linking trigger to content panel
- Enter/Space to toggle, no mouse-only interactions

**Offline (PWA):** Cached by service worker

# SEO, Local SEO, AI Search Visibility & Agent-Friendly Standards

## Overview

Royal Glow Salon & Spa is a location-based premium business — local search is the primary customer acquisition channel alongside Meta ads. Every page must be built to rank locally, pass 100% Lighthouse SEO, and be fully readable by AI agents and search crawlers from day one.

These are **non-negotiable implementation standards**, not optional enhancements. Every page is built to this spec.

---

## Part 1 — Local SEO Strategy

### Google My Business (GMB)
- Claim and fully complete the GMB listing: business name, address, phone, hours, category (Beauty Salon / Day Spa), photos
- Add services directly to GMB listing — mirrors the website services list
- Enable GMB booking/action link — points to `https://theroyalglow.in/?book=1&utm_source=gmb` so Google Maps users open the homepage booking dialog and receive source `gmb`
- In-store QR posters point to `https://theroyalglow.in/?book=1&utm_source=walkin` so scanned first-time users open the same dialog and receive source `walkin`
- Respond to all Google reviews within 24h — GMB algorithm rewards engagement
- Post weekly GMB updates (offers, new services, events) — treated as fresh content signals
- GMB Q&A section: pre-populate common questions ("Do you take walk-ins?", "What are your prices?")

### Local Keywords to Target
| Page | Primary Keyword | Secondary |
|------|----------------|-----------|
| Homepage | `luxury salon in Bengaluru` | `premium spa Bengaluru` |
| Services | `[service name] in Bengaluru` | `best [service] near me` |
| Booking | `book salon appointment Bengaluru` | `online salon booking Bengaluru` |
| About | `Royal Glow Salon Bengaluru` | `Bengaluru beauty salon` |

### NAP Consistency (Name, Address, Phone)
**NAP must be identical across every platform:**

```
Name:    Royal Glow Salon & Spa
Address: 1st Floor, Narmada Complex, 48/3, Rayasandra Main Rd,
         Above SBI Bank, Naganathapura, Parappana Agrahara,
         Bengaluru, Karnataka 560100, India
Phone:   +91 63601 35720
Website: https://theroyalglow.in
```
- Website footer and Contact page
- Google My Business
- Instagram / Facebook bio
- AiSensy WhatsApp Business profile
- Any local directories (Justdial, Sulekha, UrbanClap)

Any mismatch hurts local ranking. Use `<address>` HTML tag on every page that shows contact info.

---

## Part 2 — Structured Data (JSON-LD)

All JSON-LD is injected server-side in Next.js via `<script type="application/ld+json">` in the `<head>`. Never injected client-side.

### LocalBusiness Schema (every page)
```json
{
  "@context": "https://schema.org",
  "@type": ["LocalBusiness", "BeautySalon", "DaySpa"],
  "name": "Royal Glow Salon & Spa",
  "url": "https://theroyalglow.in",
  "logo": "https://theroyalglow.in/logo.png",
  "image": ["https://theroyalglow.in/gallery/1.jpg"],
  "telephone": "+91 63601 35720",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "1st Floor, Narmada Complex, 48/3, Rayasandra Main Rd, Above SBI Bank, Naganathapura",
    "addressLocality": "Bengaluru",
    "addressRegion": "Karnataka",
    "postalCode": "560100",
    "addressCountry": "IN"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": "12.877734987033477",
    "longitude": "77.66642516860671"
  },
  "hasMap": "https://plus.codes/VMF8+MW",
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
      "opens": "10:00",
      "closes": "21:00"
    },
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Saturday","Sunday"],
      "opens": "10:00",
      "closes": "22:00"
    }
  ],
  "priceRange": "₹₹₹",
  "paymentAccepted": "Cash, Credit Card, Debit Card, Google Pay, NFC",
  "currenciesAccepted": "INR",
  "amenityFeature": [
    { "@type": "LocationFeatureSpecification", "name": "Wheelchair-accessible entrance", "value": true },
    { "@type": "LocationFeatureSpecification", "name": "Wheelchair-accessible car park", "value": true },
    { "@type": "LocationFeatureSpecification", "name": "Wheelchair-accessible seating", "value": true },
    { "@type": "LocationFeatureSpecification", "name": "Wheelchair-accessible toilet", "value": true },
    { "@type": "LocationFeatureSpecification", "name": "Assistive hearing loop", "value": true },
    { "@type": "LocationFeatureSpecification", "name": "Gender-neutral toilets", "value": true },
    { "@type": "LocationFeatureSpecification", "name": "Sauna", "value": true },
    { "@type": "LocationFeatureSpecification", "name": "Online scheduling", "value": true },
    { "@type": "LocationFeatureSpecification", "name": "Free parking", "value": true }
  ],
  "knowsAbout": ["Skincare treatments", "Hair care", "Massage therapy", "Bridal packages", "Nail art", "Sauna"],
  "isAccessibleForFree": false,
  "sameAs": [
    "https://instagram.com/royalglow",
    "https://facebook.com/royalglow"
  ]
}
```

> **GMB action required:** Update the website field on the Google My Business profile from `royalglowsalonspa.netlify.app` → `https://theroyalglow.in` once the domain is live, and set the booking/action link to `https://theroyalglow.in/?book=1&utm_source=gmb`. This is critical for NAP consistency, local ranking, and first-touch attribution.

### Service Schema (each service page)
```json
{
  "@context": "https://schema.org",
  "@type": "Service",
  "serviceType": "Deep Tissue Massage",
  "provider": { "@type": "LocalBusiness", "name": "Royal Glow Salon & Spa" },
  "name": "Deep Tissue Massage",
  "description": "...",
  "offers": {
    "@type": "Offer",
    "price": "2500",
    "priceCurrency": "INR"
  }
}
```

### BreadcrumbList Schema (all inner pages)
```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://theroyalglow.in" },
    { "@type": "ListItem", "position": 2, "name": "Services", "item": "https://theroyalglow.in/services" },
    { "@type": "ListItem", "position": 3, "name": "Deep Tissue Massage" }
  ]
}
```

### FAQPage Schema (homepage + services)
Pre-populate with common customer questions. These appear as rich results in Google.

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "How do I book an appointment at Royal Glow?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "You can book online at theroyalglow.in/?book=1 or call us at +91 63601 35720."
      }
    }
  ]
}
```

### Additional Schemas to Implement
| Schema Type | Where |
|-------------|-------|
| `Organization` | Homepage |
| `WebSite` with `SearchAction` | Homepage (enables sitelinks search box) |
| `Person` | Staff profile pages |
| `Review` / `AggregateRating` | Once reviews are collected |
| `Event` | Promotional events / offers |
| `ImageObject` | Gallery page images |

---

## Part 3 — Sitemap & Robots Strategy

### sitemap.xml
Generated automatically by Next.js 16 built-in `app/sitemap.ts` — static routes hardcoded + blog posts fetched dynamically from Payload REST API at build time. Submitted to Google Search Console on launch.

**Sitemap includes:**
| URL | Priority | Change Frequency |
|-----|----------|-----------------|
| `/` | 1.0 | weekly |
| `/services` | 0.9 | weekly |
| `/services/[slug]` | 0.8 | monthly |
| `/about` | 0.6 | monthly |
| `/contact` | 0.6 | monthly |
| `/gallery` | 0.5 | monthly |

**Excluded from sitemap:**
- `/admin/*` — all admin routes
- `/api/*` — all API routes
- `/profile/*` — authenticated-only customer routes
- `/book` — Meta/Instagram ad lead capture page, not an organic SEO booking page

### robots.txt
```txt
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /profile/

# Explicitly allow AI crawlers (Google 2026 agent-friendly guidelines)
User-agent: GPTBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Googlebot-Extended
Allow: /

Sitemap: https://theroyalglow.in/sitemap.xml
```

---

## Part 4 — AI-Agent-Friendly Standards (Google 2026)

These are build-time requirements. Every component and page is built to this spec.

### 4a. Semantic HTML — Non-Negotiable
| Rule | Implementation |
|------|---------------|
| Use semantic tags | `<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<aside>`, `<footer>`, `<figure>`, `<time>`, `<address>` |
| Never `<div onClick>` | Always `<button>` for actions |
| Heading hierarchy | `h1` → `h2` → `h3` — no skipping levels. One `h1` per page. |
| Contact info | Wrapped in `<address>` tag |
| Dates | `<time datetime="2026-01-15">15 January 2026</time>` |
| Prices | Schema.org `Offer` markup + visible ₹ symbol in text |

### 4b. Accessible Forms
| Rule | Implementation |
|------|---------------|
| Every input has a label | `<label for="phone">` ↔ `<input id="phone">` |
| Descriptive placeholders | `placeholder="e.g. +91 98765 43210"` |
| Group related fields | `<fieldset>` + `<legend>` |
| Required fields | `required` attribute + `aria-required="true"` |
| Error messages | `aria-describedby` linking input to error element |
| Booking form | Full compliance — service selector, date/time picker, staff selector all labelled |

### 4c. Interactive Element Clarity
| Rule | Implementation |
|------|---------------|
| Clickable elements | `cursor: pointer` in Tailwind (`cursor-pointer`) |
| ARIA labels | `aria-label` on all icon buttons, close buttons, modals |
| Focus states | Visible focus ring — Tailwind `focus-visible:ring-2` — never `outline: none` without replacement |
| Keyboard navigation | Tab order follows visual order. Booking flow completable via keyboard only. |
| Dynamic content | `aria-live="polite"` on booking availability updates, booking status changes |
| Modals | `role="dialog"`, `aria-modal="true"`, focus trapped inside |

### 4d. Stable & Predictable Layout
| Rule | Implementation |
|------|---------------|
| Navigation | Identical `<nav>` structure across all pages |
| Header | Consistent logo position (top-left), CTA (Book Now — top-right) |
| Footer | NAP, links, social — identical on every page |
| CTA placement | Primary booking CTA always in the same position — agents can locate it predictably |
| No layout shift | Images: always specify `width` and `height`. Async content: reserve space with `min-height`. |
| Class naming | Consistent Tailwind + component naming — no one-off inline styles |

### 4e. Metadata — Every Page
```tsx
// Every page exports metadata via Next.js 16 generateMetadata()
export const metadata: Metadata = {
  title: 'Deep Tissue Massage | Royal Glow Salon & Spa',
  description: 'Book a deep tissue massage at Royal Glow...',
  openGraph: {
    title: '...',
    description: '...',
    images: ['/og-massage.jpg'],
    type: 'website',
    locale: 'en_IN',
  },
  twitter: {
    card: 'summary_large_image',
    title: '...',
    description: '...',
    images: ['/og-massage.jpg'],
  },
  alternates: {
    canonical: 'https://theroyalglow.in/services/deep-tissue-massage',
  },
  robots: {
    index: true,
    follow: true,
  },
}
```

### 4f. Machine-Readable Content
| Rule | Implementation |
|------|---------------|
| Image alt text | Descriptive: `alt="Therapist performing deep tissue massage at Royal Glow Spa"` — never empty, never "image1.jpg" |
| Prices | Schema.org `Offer` markup + readable text `₹2,500` |
| Staff | Schema.org `Person` with `jobTitle`, `name` |
| Availability | Schema.org `OpeningHoursSpecification` |
| Ratings | Schema.org `AggregateRating` once reviews exist |

### 4g. Agent-Exposed Endpoints (WebMCP-Ready)
Key user actions structured as clean, discrete API endpoints that AI agents can discover and call:

| Action | Endpoint | Method |
|--------|----------|--------|
| Get all services | `/api/services` | GET |
| Get service detail | `/api/services/[slug]` | GET |
| Check availability | `/api/availability?service=X&date=Y` | GET |
| Submit booking request | `/api/bookings` | POST |
| Get booking status | `/api/bookings/[id]` | GET |
| Submit campaign lead enquiry | `/api/leads` | POST |

All endpoints:
- Return clean JSON with consistent structure
- Include descriptive error messages
- Are documented in code with JSDoc comments explaining the agent use case
- Use human-readable RESTful URLs (no `/api/v1/b/c4f2` style)

### 4h. Performance & Core Web Vitals
| Rule | Implementation |
|------|---------------|
| SSR / SSG first | All public pages server-rendered or statically generated. No client-side-only critical content. |
| No-JS fallback | Core content (services, contact, about) readable without JavaScript |
| Images | Next.js `<Image>` with WebP/AVIF, `priority` on above-fold images, explicit `width` and `height` |
| Fonts | `next/font` with `display: swap`, preloaded |
| Critical CSS | Tailwind purges unused styles at build time |
| LCP target | < 2.5s |
| CLS target | < 0.1 |
| INP target | < 200ms |

> **CI enforcement:** Lighthouse CI runs on every PR and blocks merge if SEO score < 100. See [testing.md](./testing.md) Section 10 for performance budget details.

---

## Part 5 — Page-by-Page SEO Checklist

### Every Page (non-negotiable)
- [ ] Unique `<title>` — format: `[Page Topic] | Royal Glow Salon & Spa`
- [ ] Unique meta description (150–160 chars)
- [ ] OpenGraph + Twitter card tags
- [ ] Canonical URL
- [ ] LocalBusiness JSON-LD
- [ ] BreadcrumbList JSON-LD (except homepage)
- [ ] One `h1` matching the page topic
- [ ] `<address>` with NAP in footer
- [ ] `alt` text on every image
- [ ] `robots: index, follow`

### Homepage additionally
- [ ] FAQPage JSON-LD
- [ ] WebSite JSON-LD with SearchAction
- [ ] Organization JSON-LD
- [ ] Hero CTA opens the normal booking dialog (`/?book=1` deep link supported)
- [ ] Services overview with links to individual service pages

### Services index + individual service pages
- [ ] Service JSON-LD with Offer (price in INR)
- [ ] Keyword in h1, first paragraph, image alt
- [ ] "Book This Service" CTA opens the normal booking dialog with service preselected (`/?book=1&service=[slug]` supported)

### Normal booking dialog
- [ ] Fully accessible form (all rules from 4b apply)
- [ ] `aria-live` on availability slot updates
- [ ] No indexing needed: `robots: noindex` (booking form is dynamic, no SEO value)

### Admin pages
- [ ] `robots: noindex, nofollow` on all `/admin/*` routes

---

## Part 6 — Google Search Console Setup

On launch day:
1. Verify ownership via Cloudflare DNS TXT record
2. Submit `sitemap.xml`
3. Submit all key URLs for indexing
4. Set up email alerts for crawl errors
5. Monitor Core Web Vitals report weekly for first month

---

## Part 7 — AI Search Visibility (Google AI Overviews, ChatGPT, Perplexity)

Google Search now shows **AI Overviews** (AI-generated answers) at the top of results. ChatGPT, Perplexity, and Claude also recommend businesses when users ask questions like *"best luxury salon in [city]"*. Getting cited in these AI answers requires a fundamentally different approach from traditional SEO.

### How AI Overviews Select Sources

Google's AI Overview pulls from pages that:
1. **Directly answer the question** in the first 2–3 sentences of a section
2. **Use clear, factual, structured content** — not marketing fluff
3. **Have strong E-E-A-T signals** (Experience, Expertise, Authoritativeness, Trustworthiness)
4. **Are already ranking** on page 1 for the query (AI Overview amplifies, it doesn't replace rankings)
5. **Use Schema.org markup** — structured data is weighted heavily by AI systems parsing pages

### Content Strategy for AI Citation

Every public page must follow the **answer-first** writing pattern:

```
❌ WRONG (marketing-first):
"Welcome to Royal Glow Salon & Spa, where beauty meets luxury.
Our expert team has decades of experience in..."

✅ CORRECT (answer-first):
"Royal Glow Salon & Spa is a premium beauty salon and spa in [City],
offering haircuts, facials, massages, and bridal packages.
Book appointments online at theroyalglow.in/?book=1 or call +91 63601 35720.
Open Monday–Friday 10am–9pm, Saturday–Sunday 10am–10pm."
```

The correct version directly answers: *What is this? Where is it? What does it offer? How do I book?* — exactly what AI systems extract.

### Page-Level AI Optimization

| Page | AI Query It Should Answer | Required Content Pattern |
|------|--------------------------|------------------------|
| Homepage | "best luxury salon in [city]" | First paragraph: name, location, category, key services, booking link. Then detailed sections. |
| Each service page | "how much does [service] cost in [city]" | First line: service name, price, duration, location. Then description. |
| About page | "who owns Royal Glow salon" | First paragraph: owner name, city, founding year, specialty. |
| Contact page | "Royal Glow salon address / phone / hours" | Structured in `<address>` tag, hours in `<time>` tags, all Schema.org marked |
| FAQ section | "does Royal Glow take walk-ins" | Question as `<h3>`, answer immediately below in 1–2 sentences. FAQPage JSON-LD. |

### The FAQ Strategy — Highest AI Overview Hit Rate

FAQs have the **highest citation rate** in AI Overviews because they match the exact question → answer format AI systems prefer.

**Required FAQ topics (build into homepage and services pages):**

| Question | Answer Pattern |
|----------|---------------|
| "What services does Royal Glow offer?" | Concise list: haircuts, facials, massages, bridal packages, nail art, etc. with prices |
| "How do I book at Royal Glow?" | "Book online at theroyalglow.in/?book=1, call +91 63601 35720, or scan the in-store QR. Google Maps users can use theroyalglow.in/?book=1&utm_source=gmb." |
| "Does Royal Glow take walk-ins?" | Direct yes/no + policy detail |
| "What are Royal Glow's prices?" | Price range + link to full menu |
| "Where is Royal Glow located?" | Full address + landmark |
| "What are Royal Glow's opening hours?" | Days + times |
| "Does Royal Glow offer bridal packages?" | Yes/no + brief details |
| "How can I cancel or reschedule?" | Policy in 1–2 sentences |

Each FAQ must also be marked up in **FAQPage JSON-LD** — this is what triggers Google's FAQ rich result AND feeds into AI Overviews.

---

## Part 8 — `llms.txt` Standard (AI Agent Discovery File)

`llms.txt` is the **robots.txt for AI models** — a plain-text file at the site root that helps AI systems understand the site quickly. Emerging standard adopted by AI search platforms.

### File: `https://theroyalglow.in/llms.txt`

```txt
# Royal Glow Salon & Spa
# Premium beauty salon and day spa in Bengaluru, India

## About
Royal Glow Salon & Spa is a premium beauty salon and day spa located in
Parappana Agrahara, Bengaluru, Karnataka 560100, India.
We offer haircuts, hair colouring, facials, massages, bridal packages, nail art, and skincare treatments.

## Services
Full menu with prices: https://theroyalglow.in/services
Online booking: https://theroyalglow.in/?book=1
Google Maps booking link: https://theroyalglow.in/?book=1&utm_source=gmb
In-store QR booking link: https://theroyalglow.in/?book=1&utm_source=walkin

## Key Pages
- Homepage: https://theroyalglow.in
- Services & Prices: https://theroyalglow.in/services
- Book Appointment: https://theroyalglow.in/?book=1
- About Us: https://theroyalglow.in/about
- Contact & Location: https://theroyalglow.in/contact
- Gallery: https://theroyalglow.in/gallery

## Contact
Phone: +91 63601 35720
Email: hello@theroyalglow.in
Address: 1st Floor, Narmada Complex, 48/3, Rayasandra Main Rd,
         Above SBI Bank, Naganathapura, Parappana Agrahara,
         Bengaluru, Karnataka 560100, India
Hours: Monday–Friday 10:00 AM – 9:00 PM
       Saturday–Sunday 10:00 AM – 10:00 PM

## API (for agent integrations)
Services list: https://theroyalglow.in/api/services
Check availability: https://theroyalglow.in/api/availability?service={slug}&date={YYYY-MM-DD}
Submit booking request: POST https://theroyalglow.in/api/bookings
Submit campaign lead enquiry: POST https://theroyalglow.in/api/leads

## Social
Instagram: https://instagram.com/royalglow
Facebook: https://facebook.com/royalglow
```

### Also serve `llms-full.txt`
A detailed version with the full service list, all prices, all staff specializations. AI systems that want deeper context will fetch this file.

```txt
File: https://theroyalglow.in/llms-full.txt

Contains:
- Complete service menu with prices and durations
- Staff names and specializations
- Detailed booking instructions
- Cancellation and rescheduling policy
- FAQs
```

### Implementation in Next.js
Both files served as static assets from `/public/llms.txt` and `/public/llms-full.txt`, or via API routes that pull live data from Neon DB so prices stay current without manual updates.

---

## Part 9 — AI Crawler Access Configuration

### robots.txt Updates (expanded from Part 3)
```txt
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /profile/

# Google AI systems
User-agent: Googlebot
Allow: /

User-agent: Googlebot-Extended
Allow: /

User-agent: Google-Extended
Allow: /

# ChatGPT
User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

# Perplexity
User-agent: PerplexityBot
Allow: /

# Anthropic / Claude
User-agent: Claude-Web
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: anthropic-ai
Allow: /

# Microsoft / Bing AI
User-agent: Bingbot
Allow: /

# Meta AI
User-agent: FacebookBot
Allow: /

# Apple Intelligence
User-agent: Applebot
Allow: /
User-agent: Applebot-Extended
Allow: /

# Common crawlers used for AI training
User-agent: CCBot
Allow: /

User-agent: cohere-ai
Allow: /

Sitemap: https://theroyalglow.in/sitemap.xml
```

**Why allow all AI crawlers:** Royal Glow is a public business that benefits from maximum AI visibility. Blocking crawlers (like some publishers do) makes sense for content creators protecting IP — not for a salon that wants to be recommended. More AI systems indexing your site = more chances of being cited in AI answers.

---

## Part 10 — E-E-A-T Signals (Google's Trust Framework)

Google AI Overviews heavily weight **E-E-A-T** — Experience, Expertise, Authoritativeness, Trustworthiness. For a salon, this translates to:

### Experience
- **Gallery page** with real photos of actual services performed (not stock photos)
- **Staff profiles** with real photos, qualifications, years of experience
- **Customer testimonials** on service pages (once collected)

### Expertise
- Service pages include **detailed descriptions** — not just "Deep Tissue Massage ₹2,500" but what it involves, who it's for, duration, aftercare advice
- Blog/tips section (Phase 2) — "5 Signs You Need a Deep Tissue Massage" positions Royal Glow as an authority

### Authoritativeness
- **Google Reviews** — actively request reviews from happy customers. GMB rating directly influences AI citation
- **NAP consistency** across all directories — signals a real, established business
- **Backlinks from local directories** — Justdial, Sulekha, Google Maps, Instagram bio

### Trustworthiness
- **HTTPS everywhere** (Cloudflare handles this)
- **Privacy policy** page — legally required, also a trust signal
- **Real contact information** visible on every page (not hidden behind a form)
- **Physical address on Google Maps** embedded on Contact page

---

## Part 11 — Monitoring AI Search Performance

### How to Track If AI Overviews Are Citing You

| Tool | What It Shows | Cost |
|------|-------------|------|
| **Google Search Console** | "AI Overview" impressions appear in the Performance report (2025+) | Free |
| **Manual search audits** | Weekly: search your target queries in Google, check if Royal Glow appears in the AI answer | Free |
| **PostHog referrer tracking** | Track visits where `referrer` contains `google.com` with AI Overview click patterns | Free (already in stack) |

### Queries to Monitor Weekly
Search these from an incognito browser and check AI Overview inclusion:
- "best salon in [city]"
- "luxury spa near me" (from your city)
- "[service name] price in [city]"
- "book salon appointment [city]"
- "Royal Glow Salon"

### AI Search Optimization Checklist (Monthly)
- [ ] Are FAQs still current? Update with new common questions from WhatsApp/AiSensy
- [ ] Are prices on the website matching GMB listing?
- [ ] Any new Google Reviews to respond to?
- [ ] Has a new AI crawler appeared that needs allowing in robots.txt?
- [ ] Is `llms.txt` / `llms-full.txt` current with latest services and prices?
- [ ] Are service pages still ranking on Google page 1 for local keywords? (prerequisite for AI Overview citation)

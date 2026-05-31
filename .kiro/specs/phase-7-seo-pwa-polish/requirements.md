# Requirements Document

## Introduction

Phase 7 makes the Royal Glow Salon & Spa public site discoverable, installable, and compliant. It implements the structured-data, crawler, and AI-discovery standards from `seo.md` (treated as non-negotiable), adds a Progressive Web App layer (manifest, service worker, offline page), a two-tier cookie-consent banner, the static legal pages, and consent-gated analytics (Meta Pixel + PostHog).

The work is presentation, metadata, and static assets built on the public surfaces from Phases 2–6. There are no schema changes; the only data reads are the existing service-catalogue and active-offers queries. Third-party analytics load only after explicit opt-in and only when their keys are configured, so the build runs in any environment.

Out of scope: blog/gallery pages and their schemas (Phase 8), Review/AggregateRating (needs real reviews), staff Person pages, Lighthouse CI enforcement (Phase 9), server-side Meta CAPI, and final icon/OG raster art (a documented asset manifest with stable paths is delivered).

## Glossary

- **Business_Facts**: The single canonical constant holding the salon's name, address, phone, hours, geo, socials, and related facts (NAP source of truth).
- **JsonLd_Builder**: A pure function producing a Schema.org JSON-LD object (LocalBusiness, Organization, WebSite, BreadcrumbList, Service, FAQPage).
- **Metadata_Helper**: The shared function producing a page's Next.js `Metadata` (title, description, OpenGraph, Twitter, canonical, robots).
- **Sitemap_Route** / **Robots_Route**: The Next.js `app/sitemap.ts` and `app/robots.ts` route modules.
- **Llms_Route**: The `/llms.txt` and `/llms-full.txt` route handlers serving the AI-discovery files from live data.
- **PWA_Layer**: The web app manifest, service worker, registration component, and offline fallback page.
- **Consent_State**: The persisted user choice `{ necessary, analytics, marketing, decided }`.
- **Consent_Banner**: The two-tier cookie banner that captures and persists Consent_State.
- **Analytics_Loader**: The client component that loads Meta Pixel / PostHog only when consent and keys permit.
- **Site_Url**: The site's absolute base URL, derived from `NEXT_PUBLIC_APP_URL`.
- **AI_Crawler**: A bot user-agent for an AI system (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, etc.) that `seo.md` requires be allowed.

## Requirements

### Requirement 1: Structured Data (JSON-LD)

**User Story:** As a search engine and AI system, I want valid structured data on every public page, so that the business can be understood, indexed, and cited.

#### Acceptance Criteria

1. WHEN a public page renders, THE JsonLd_Builder SHALL produce a LocalBusiness JSON-LD object whose name, address, telephone, geo, and opening hours come from Business_Facts.
2. THE LocalBusiness JSON-LD SHALL declare `@context` as `https://schema.org` and a `@type` array including `LocalBusiness`.
3. WHEN a service is represented in JSON-LD, THE JsonLd_Builder SHALL produce a Service object with an Offer whose price is the service's price as a whole-rupee value and whose currency is `INR`.
4. WHEN JSON-LD is embedded in the page, THE rendered script content SHALL be escaped so it cannot terminate the surrounding script element.
5. THE footer and contact page SHALL render the same name, address, and phone as Business_Facts.

### Requirement 2: Crawler and AI Discovery Files

**User Story:** As a crawler operator, I want a sitemap, robots rules, and llms files, so that I can crawl the right pages and understand the site.

#### Acceptance Criteria

1. WHEN the Robots_Route is requested, THE Robots_Route SHALL allow the named AI_Crawler user-agents and reference the sitemap at Site_Url.
2. THE Sitemap_Route SHALL list public pages (home, services, service slugs, about, contact, faq, offers, legal) and SHALL exclude every path under `/admin`, `/api`, `/profile`, `/staff`, `/book`, and `/sign-in`.
3. THE Robots_Route SHALL disallow `/admin/`, `/api/`, `/profile/`, `/staff/`, and `/book` for the default user-agent.
4. WHEN an Llms_Route is requested, THE Llms_Route SHALL include the current active service names from the database AND SHALL return a successful response with a static fallback body if the database read fails.

### Requirement 3: Page Metadata

**User Story:** As a site owner, I want every public page to have correct, unique metadata, so that it ranks and shares correctly.

#### Acceptance Criteria

1. WHEN a public page renders, THE Metadata_Helper SHALL produce a unique title suffixed with the brand and a description, plus OpenGraph and Twitter card tags.
2. THE Metadata_Helper SHALL set the canonical URL to Site_Url concatenated with the page path, without duplicate slashes.
3. THE Metadata_Helper SHALL set robots indexing per its argument, defaulting to indexable, AND admin, staff, profile, and booking-landing routes SHALL be non-indexable.

### Requirement 4: Progressive Web App

**User Story:** As a mobile customer, I want to install the site and have a graceful offline experience, so that it behaves like an app.

#### Acceptance Criteria

1. WHEN a browser requests the web app manifest, THE PWA_Layer SHALL return a valid manifest with name, start URL, standalone display, theme colours, and icon references.
2. WHEN the page loads in a supporting browser, THE PWA_Layer SHALL register the service worker, and SHALL no-op where service workers are unavailable.
3. THE service worker SHALL NOT cache or serve from cache any request under `/api`, `/admin`, or the auth routes.
4. WHILE the network is unavailable for a navigation request, THE service worker SHALL serve the offline fallback page.

### Requirement 5: Cookie Consent and Analytics Gating

**User Story:** As a visitor, I want control over tracking cookies, so that nothing tracks me without my consent.

#### Acceptance Criteria

1. WHEN a visitor saves a consent choice, THE Consent_Banner SHALL persist Consent_State with `necessary` always true and `decided` true, and a subsequent read SHALL return that state; an undecided store SHALL read as not decided.
2. THE Analytics_Loader SHALL NOT load Meta Pixel unless marketing consent is granted AND the Pixel identifier is configured.
3. THE Analytics_Loader SHALL NOT load PostHog unless analytics consent is granted AND the PostHog key is configured.
4. WHEN the event helper is called without the corresponding provider loaded, THE event helper SHALL no-op without error.

### Requirement 6: Legal Pages

**User Story:** As a visitor and a regulator, I want privacy, terms, and refund pages, so that the business is transparent and compliant.

#### Acceptance Criteria

1. WHEN a legal page renders, THE page SHALL be indexable and SHALL present a single primary heading and a unique title and description.
2. THE privacy, terms, and refund-policy pages SHALL each render distinct content and SHALL be linked from the footer.

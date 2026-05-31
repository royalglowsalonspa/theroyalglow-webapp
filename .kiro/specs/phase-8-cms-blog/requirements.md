# Requirements Document

## Introduction

Phase 8 adds the marketing content layer for Royal Glow Salon & Spa: a Payload CMS v3 application (`apps/cms`) that owns blog posts, gallery images, team bios, homepage banners, and FAQ entries, and the web-app consumption surfaces (`apps/web`) that render that content — a `/blog` listing, `/blog/[slug]` detail pages, and a `/gallery` page — with the same SEO discipline established in Phase 7 (per-page metadata, server-rendered JSON-LD, breadcrumbs, sitemap entries).

Payload is marketing content only. The service catalogue, bookings, billing, memberships, and the RBAC `/admin` portal stay in the custom Next.js app backed by the `@rgss/db` Drizzle schema. Payload runs as its own Next.js-based app, self-hosted at `admin.theroyalglow.in`, writing to its own tables in Neon Postgres and storing media in Cloudflare R2. The two systems share the Neon database but never share tables.

The defining constraint is graceful degradation: the web app must build, typecheck, lint, and serve `/blog` and `/gallery` even when no CMS environment is configured — showing an empty state or a static fallback, never a build break or a 500. This mirrors the project's guarded-extension-point convention.

Out of scope (deferred): real content authoring (actual posts, photos, bios); comments, full-text search, and rich pagination beyond a simple list; migrating the `/admin` portal into Payload; the Fumadocs docs site; R2 bucket provisioning and DNS for `admin.theroyalglow.in`; `Review`/`AggregateRating` and standalone indexable staff-profile pages; and Payload→web on-demand webhook revalidation (time-based ISR is the shipped mechanism).

## Glossary

- **Payload_CMS**: The Payload CMS v3 application in `apps/cms` — a Next.js-based headless CMS serving an admin UI at `admin.theroyalglow.in` and a REST API, writing to its own Neon tables and storing media in Cloudflare R2.
- **Content_Collection**: A Payload collection holding marketing content — one of `blog`, `gallery`, `team`, `banner`, `faq` — plus the shared `media` upload collection and `users` auth collection.
- **Blog_Post**: A `blog` document with title, slug, excerpt, cover image, rich body, author, category, tags, SEO fields, `publishedAt`, and a `draft | published` status.
- **CMS_Client**: The thin web-app client in `apps/web/src/lib/cms/*` that reads published content from Payload's REST API, normalises it into typed view-models, and degrades to empty results when the CMS is unconfigured or unreachable.
- **Gallery_Image**: A `gallery` document with a required image, required `alt`, optional caption, and optional category.
- **Team_Member**: A `team` document with name, role, bio, photo, specializations, and display order.
- **Banner**: A `banner` document (homepage promo) with headline, image, optional CTA, an `active` flag, and an optional `[startAt, endAt]` active window.
- **Content_Faq**: A `faq` document (question, answer, category, order) — the CMS-managed counterpart to the static `FAQS` list in `lib/seo/business.ts`.
- **Media**: A Payload upload document backed by the Cloudflare R2 S3 storage adapter, resolved by the web app to an absolute image URL with `alt`, `width`, and `height`.
- **BlogPosting_JsonLd**: The pure builder producing Schema.org `BlogPosting` structured data for `/blog/[slug]`.
- **ImageObject_JsonLd**: The pure builder producing Schema.org `ImageObject` structured data for a gallery image.
- **Metadata_Helper**: The shared Phase 7 `buildMetadata` function producing a page's Next.js `Metadata` (title, description, OpenGraph, Twitter, canonical, robots).
- **Sitemap_Route**: The Next.js `app/sitemap.ts` route module, extended in this phase to include blog and gallery entries.
- **Site_Url**: The site's absolute base URL, derived from `NEXT_PUBLIC_APP_URL` (the Phase 7 `SITE_URL`).
- **Cms_Url**: The base URL of the Payload REST API the web app reads, derived from `CMS_URL`.
- **ISR**: Incremental Static Regeneration — the web pages revalidate on a time window (~1 hour).

## Requirements

### Requirement 1: Payload CMS Application & Content Collections

**User Story:** As a content editor, I want a headless CMS that owns marketing content, so that I can manage blog posts, gallery, team, banners, and FAQs without touching the operational system.

#### Acceptance Criteria

1. THE Payload_CMS SHALL be a Payload CMS v3 application in `apps/cms` that serves an admin UI at `admin.theroyalglow.in` and persists content to Neon Postgres via the Postgres adapter.
2. THE Payload_CMS SHALL define the Content_Collections `blog`, `gallery`, `team`, `banner`, and `faq`, plus a shared `media` upload collection and a `users` authentication collection.
3. THE Payload_CMS SHALL own its own database tables, AND the web app SHALL NOT issue any `@rgss/db` query against Payload-owned tables, AND the Payload_CMS SHALL NOT read or write the `@rgss/db` operational tables.
4. WHERE media is uploaded, THE Payload_CMS SHALL store the media in Cloudflare R2 via the S3 storage adapter and expose a public URL for it.
5. WHEN an anonymous request reads a Content_Collection over the REST API, THE Payload_CMS SHALL return only world-readable (published or non-status) documents, AND THE Payload_CMS SHALL require an authenticated user for create, update, and delete operations.

### Requirement 2: Blog Content Model & Publishing

**User Story:** As a content editor, I want a structured blog and banner model with a publishing workflow, so that only finished content appears on the public site.

#### Acceptance Criteria

1. WHEN the CMS_Client reads blog content, THE CMS_Client SHALL request only posts whose status is `published`, AND no draft post SHALL appear in any view-model returned to a page.
2. THE Blog_Post model SHALL include title, unique kebab-case slug, excerpt, optional cover image, rich-text body, optional author relation, optional category, optional tags, optional SEO fields, `publishedAt`, and a `draft | published` status defaulting to `draft`.
3. THE `gallery`, `team`, `banner`, and `faq` collections SHALL each expose the fields defined in the design (gallery: image, alt, caption, category; team: name, role, bio, photo, specializations, order; banner: headline, image, ctaLabel, ctaHref, active, startAt, endAt, order; faq: question, answer, category, order).
4. WHEN `getActiveBanners(now)` evaluates a Banner, THE CMS_Client SHALL include it only IF the banner's `active` flag is true AND `now` falls within its `[startAt, endAt]` window, treating an absent `startAt` or `endAt` bound as open-ended.

### Requirement 3: Blog Pages

**User Story:** As a site visitor, I want a blog listing and readable article pages, so that I can discover beauty and wellness content from Royal Glow.

#### Acceptance Criteria

1. WHEN the `/blog` and `/blog/[slug]` pages render, THE page SHALL present exactly one `h1`, metadata produced by the Metadata_Helper, and a `BreadcrumbList` for the page.
2. THE `/blog` listing SHALL render published posts in reverse-chronological order with ISR revalidation of approximately one hour, AND THE `/blog/[slug]` page SHALL render the post body from serialised rich text with the same ISR window.
3. WHEN a Blog_Post is rendered on `/blog/[slug]`, THE page SHALL render its `publishedAt` inside a `<time datetime="{ISO-8601}">` element whose human text is `formatDateIN(publishedAt)` (DD/MM/YYYY, IST), AND the corresponding JSON-LD SHALL use the same instant in ISO-8601.
4. IF a requested blog slug has no matching published post, THEN THE `/blog/[slug]` page SHALL respond with a 404 via `notFound()`.
5. WHEN a blog cover image is rendered, THE page SHALL provide a non-empty `alt` and explicit `width` and `height` (or a fill layout with reserved space) to avoid layout shift.

### Requirement 4: Gallery Page

**User Story:** As a site visitor, I want a gallery page, so that I can see real photos of the salon, spa, and work.

#### Acceptance Criteria

1. WHEN the `/gallery` page renders, THE page SHALL present exactly one `h1`, metadata produced by the Metadata_Helper, and a `BreadcrumbList`.
2. WHEN a Gallery_Image is rendered, THE page SHALL emit one ImageObject_JsonLd for that image.
3. WHEN a Gallery_Image is rendered, THE page SHALL provide a non-empty `alt` and explicit `width` and `height` (or a fill layout with reserved space) to avoid layout shift.

### Requirement 5: Structured Data & Metadata for Content

**User Story:** As a search engine and AI system, I want valid structured data and metadata on the content pages, so that articles and images can be understood, indexed, and cited.

#### Acceptance Criteria

1. WHEN BlogPosting_JsonLd is built for a post, THE builder SHALL produce an object declaring `@context` as `https://schema.org` and `@type` as `BlogPosting`, with a non-empty `headline`, an ISO-8601 `datePublished`, a `publisher` derived from the canonical business facts, and `mainEntityOfPage` equal to Site_Url concatenated with `/blog/{slug}`.
2. WHEN ImageObject_JsonLd is built for a gallery image, THE builder SHALL produce an object declaring `@type` as `ImageObject` with a non-empty content URL and the image's `alt` carried into its caption/name.
3. THE Metadata_Helper SHALL set the canonical URL for each content page to Site_Url concatenated with the page path, without duplicate slashes.
4. WHEN content JSON-LD is embedded in a page, THE rendered script content SHALL be escaped through the shared JsonLd component so it cannot terminate the surrounding script element.

### Requirement 6: Sitemap Extension

**User Story:** As a crawler operator, I want blog and gallery URLs in the sitemap, so that I can discover and index the content pages.

#### Acceptance Criteria

1. THE Sitemap_Route SHALL include a `/blog` entry, a `/gallery` entry, and one entry per published blog slug returned by the CMS_Client.
2. WHEN the CMS is unconfigured or unreachable, THE Sitemap_Route SHALL omit blog-slug entries and SHALL still return a valid sitemap (the Phase 7 output) without erroring.

### Requirement 7: Graceful Degradation & Guarded CMS Client

**User Story:** As a developer, I want the web app to build and run without any CMS configuration, so that the system never depends on the CMS being live.

#### Acceptance Criteria

1. WHEN no CMS environment is configured, THE web app SHALL build, typecheck, lint, and serve successfully, AND `isCmsConfigured()` SHALL be false so content pages render an empty state.
2. WHEN the CMS returns no content for a page, THE `/blog`, `/blog/[slug]`, and `/gallery` pages SHALL render an empty state or a 404 without throwing.
3. WHEN the CMS is unconfigured, unreachable, times out, returns a non-2xx response, or returns malformed data, THE CMS_Client functions SHALL each resolve to a safe value (`[]` or `null`) and log the anomaly, AND SHALL NOT throw or reject.

### Requirement 8: FAQ Source-of-Truth

**User Story:** As a content editor and a site owner, I want FAQs editable in the CMS with a guaranteed fallback, so that FAQ content can be updated without code changes while the FAQPage structured data always renders.

#### Acceptance Criteria

1. WHEN the CMS returns one or more Content_Faqs, THE FAQ resolution SHALL use the CMS-sourced FAQs as the source of truth.
2. IF the CMS returns no Content_Faqs or is unreachable, THEN THE FAQ resolution SHALL fall back to the static `FAQS` constant so the result is always non-empty and the FAQPage JSON-LD always has content.

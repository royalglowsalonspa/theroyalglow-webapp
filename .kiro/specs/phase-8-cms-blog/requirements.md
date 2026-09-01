# Requirements Document

## Introduction

Phase 8 adds Royal Glow's Payload CMS v3 application and customer-facing content pages. Payload owns marketing content plus service-catalogue authoring. Marketing documents remain in Payload-owned `cms` tables and are consumed through Payload REST. `service_category` and `service` are the authoritative catalogue write surfaces; atomic hooks mirror each successful save into Drizzle-owned `public.service_category` and `public.service` read models used by booking, availability, offers, and admin selectors.

Payload runs at `cms.theroyalglow.in` on Render, uses Neon PostgreSQL, and stores media in Cloudflare R2. It does not own bookings, billing, memberships, staff assignments, offer-service links, or the Better Auth admin portal.

Customer content reads degrade gracefully. The web app must build and serve when `NEXT_PUBLIC_CMS_URL` is absent or Payload is unavailable, returning empty content or static fallbacks instead of failing.

## Glossary

- **Payload_CMS**: Payload v3 app in `apps/cms`, including admin UI, REST API, marketing collections, and catalogue authoring.
- **Content_Collection**: One of the registered Payload collections: `users`, `media`, `blog`, `gallery`, `team`, `banner`, `faq`, `testimonial`, `offer`, `service-card`, `service_category`, or `service`.
- **Catalogue_Authoring_Source**: Payload `service_category` and `service` collections, the only supported human write surface for the bookable catalogue.
- **Catalogue_Read_Model**: Drizzle-owned `public.service_category` and `public.service` tables consumed by operational application code.
- **Catalogue_Sync_Hook**: Atomic Payload `afterChange` hook that mirrors catalogue documents into the corresponding Drizzle read model.
- **CMS_Client**: Guarded client under `apps/web/src/lib/cms` that reads published marketing content over Payload REST.
- **Media**: Payload upload document stored through the Cloudflare R2 S3 adapter.
- **Cms_Url**: Optional public Payload origin from `NEXT_PUBLIC_CMS_URL`.
- **ISR**: Time-based Incremental Static Regeneration for public content pages.

## Requirements

### Requirement 1: Payload Application and Ownership

**User Story:** As a content editor, I want one CMS for marketing content and service-catalogue authoring.

#### Acceptance Criteria

1. THE Payload_CMS SHALL run from `apps/cms`, serve its admin UI at `cms.theroyalglow.in`, and persist through Payload's Postgres adapter.
2. THE Payload_CMS SHALL register the live marketing/auth/media collections plus `service_category` and `service` as defined in `payload.config.ts`.
3. THE Payload_CMS SHALL be the authoring source of truth for services and service categories. Each successful create/update SHALL mirror into `public.service` or `public.service_category` through the configured `afterChange` hook and transaction. Booking-facing code SHALL continue treating those `public.*` tables as Drizzle read models.
4. Payload-owned marketing tables SHALL remain isolated in the `cms` schema. Payload SHALL write no operational `public.*` table except the two documented catalogue sync targets.
5. Service/category delete SHALL remain disabled; retirement SHALL use `isActive`.
6. R2 storage SHALL enable only when `R2_BUCKET_NAME`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` are all present. The CMS SHALL consume `R2_ENDPOINT` directly rather than reconstructing it from an account ID.
7. Anonymous reads SHALL expose only content allowed by each collection's access rules; write operations SHALL require an authenticated Payload user.

### Requirement 2: Blog and Marketing Models

**User Story:** As a content editor, I want structured marketing content and publishing controls.

#### Acceptance Criteria

1. Blog reads SHALL return only published posts.
2. A blog post SHALL support title, unique slug, excerpt, cover media, rich body, author, taxonomy, SEO fields, publication time, and draft/published status.
3. Gallery, team, banner, FAQ, testimonial, offer, and service-card collections SHALL expose the fields implemented in their live collection definitions.
4. `service-card` SHALL remain display-only marketing content and SHALL NOT replace the operational `service` catalogue.
5. Active-banner resolution SHALL respect its active flag and optional start/end bounds.

### Requirement 3: Public Content Pages

**User Story:** As a visitor, I want useful blog and gallery pages.

#### Acceptance Criteria

1. `/blog`, `/blog/[slug]`, and `/gallery` SHALL render one `h1`, canonical metadata, and breadcrumbs.
2. Public content pages SHALL use the configured ISR window and guarded CMS client.
3. Published dates SHALL use semantic `<time datetime>` markup with Indian display formatting.
4. Missing or unpublished blog slugs SHALL return `notFound()`.
5. Images SHALL have non-empty alt text and reserved dimensions.

### Requirement 4: Structured Data and Sitemap

**User Story:** As a crawler, I want machine-readable content and discoverable URLs.

#### Acceptance Criteria

1. Blog detail pages SHALL emit valid `BlogPosting` JSON-LD.
2. Gallery entries SHALL emit valid `ImageObject` JSON-LD.
3. JSON-LD serialization SHALL escape content through the shared component.
4. Sitemap generation SHALL include static content routes and published blog slugs when available.
5. CMS failure SHALL NOT prevent sitemap generation.

### Requirement 5: Guarded CMS Client

**User Story:** As a developer, I want customer pages independent of CMS availability.

#### Acceptance Criteria

1. `apps/web/src/lib/cms/config.ts` SHALL read optional `NEXT_PUBLIC_CMS_URL` and report unconfigured state when absent or invalid.
2. CMS client functions SHALL return `[]` or `null` on missing configuration, timeout, network failure, non-2xx response, or malformed data.
3. Web code SHALL consume Payload only through HTTP/client view models and SHALL NOT import Payload's Node dependencies.
4. Marketing REST reads SHALL remain separate from operational catalogue reads through `@rgss/db`.

### Requirement 6: FAQ Fallback

**User Story:** As a site owner, I want editable FAQs without losing content during a CMS outage.

#### Acceptance Criteria

1. WHEN Payload returns FAQs, public FAQ surfaces SHALL use them.
2. WHEN Payload returns none or is unavailable, public FAQ surfaces SHALL fall back to the static `FAQS` constant.

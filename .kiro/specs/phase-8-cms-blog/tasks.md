# Implementation Plan: Phase 8 — CMS and Blog

## Overview

Maintain the Payload CMS app for marketing content and service-catalogue authoring, plus guarded customer content pages. Payload owns catalogue writes through `service_category` and `service`; atomic hooks mirror those documents to Drizzle `public.*` read models. Customer marketing reads use Payload REST and degrade safely when `NEXT_PUBLIC_CMS_URL` is absent or unavailable.

## Tasks

- [x] 1. Guarded CMS client foundation
  - Keep `apps/web/src/lib/cms/config.ts` on optional `NEXT_PUBLIC_CMS_URL`, read behind a guard so missing configuration never breaks build or runtime.
  - Keep typed view models and total client functions that return `[]`/`null` on missing configuration, timeout, network failure, non-2xx response, or invalid payload.
  - Resolve relative media URLs through the configured CMS/public-media origin without requiring a server-only read token that does not exist.
  - Keep Lexical serialization allowlisted and safe; do not pass arbitrary HTML to `dangerouslySetInnerHTML`.
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 2. SEO and public content surfaces
  - Keep `BlogPosting` and `ImageObject` JSON-LD builders pure and reuse shared metadata, breadcrumb, business, and JSON-LD serialization helpers.
  - Keep `/blog`, `/blog/[slug]`, and `/gallery` as server-rendered customer routes with the configured ISR window, semantic headings/time elements, image dimensions, and guarded empty/404 states.
  - Keep sitemap blog entries guarded so Payload failure cannot break the sitemap.
  - Keep FAQ resolution CMS-preferred with static `FAQS` fallback.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 6.1, 6.2_

- [x] 3. Payload application and environment contract
  - Keep `apps/cms/.env.example` aligned with `payload.config.ts`: `PAYLOAD_SECRET`, `DATABASE_URL`, `PAYLOAD_PUBLIC_SERVER_URL`, `WEB_APP_URL`, `SERVICE_SYNC_ENABLED`, `R2_BUCKET_NAME`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`.
  - Do not substitute `R2_ACCOUNT_ID` for `R2_ENDPOINT`; do not list `NEXT_PUBLIC_R2_PUBLIC_URL` as a CMS storage-plugin input.
  - Enable R2 storage only when all four server-side R2 values are present. Consume `R2_ENDPOINT` directly with region `auto` and path-style S3 access.
  - Keep Payload hosted independently on Render; never add Payload to web's `transpilePackages`.
  - _Requirements: 1.1, 1.6, 1.7_

- [x] 4. Register live collections and catalogue ownership
  - Keep the current collection order: `Users`, `Media`, `Blog`, `Gallery`, `Team`, `Banner`, `Faq`, `Testimonial`, `Offer`, `ServiceCard`, `ServiceCategory`, `Service`.
  - Treat `ServiceCategory` and `Service` as the authoritative catalogue write surface. Keep `syncServiceCategoryToPublic` and `syncServiceToPublic` atomic and composed before cache revalidation.
  - Keep operational booking reads on Drizzle `public.service_category` and `public.service`; Payload writes no other operational tables.
  - Keep delete disabled for service/category and use `isActive` for retirement.
  - Keep `ServiceCard` as display-only homepage content, distinct from a bookable service.
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 2.3, 2.4_

- [x] 5. Public marketing collection behavior
  - Keep collection access rules, publication filters, slugs, SEO fields, media relations, ordering, and active windows aligned with the live collection files.
  - Keep public web reads over Payload REST through `apps/web/src/lib/cms`; web code must not query Payload-owned `cms.*` tables directly.
  - _Requirements: 1.7, 2.1, 2.2, 2.3, 2.5, 5.3, 5.4_

- [x] 6. Validation
  - Run web and CMS typechecks with current environment validation rules.
  - Run Biome on affected files.
  - Confirm customer content routes and sitemap degrade safely with no CMS URL.
  - Confirm Payload owns catalogue authoring and booking code reads only synchronized Drizzle read models.
  - Confirm no test files are added solely for this documentation reconciliation.

## Notes

- Payload owns marketing content **and service-catalogue authoring**. Drizzle owns operational booking read models.
- The catalogue sync boundary is the explicit exception to normal `cms.*` table isolation.
- `NEXT_PUBLIC_CMS_URL` is the customer app's optional Payload origin. Root `.env.example`, not a nonexistent `apps/web/.env.example`, is the shared starter template.
- CMS R2 storage requires `R2_BUCKET_NAME`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`.
- No Cloudflare Workers, Pages, Wrangler, or KV compute resource participates. Cloudflare remains R2 storage and authoritative DNS only.

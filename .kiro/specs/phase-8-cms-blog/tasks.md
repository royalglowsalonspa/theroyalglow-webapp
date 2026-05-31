# Implementation Plan: Phase 8 — CMS & Blog

## Overview

Stand up the Payload CMS v3 app (`apps/cms`) for marketing content (blog/gallery/team/banner/faq + media/users) writing to its own Neon tables and Cloudflare R2, and build the web-app consumption surfaces (`/blog`, `/blog/[slug]`, `/gallery`) plus SEO wiring (`BlogPosting`/`ImageObject` JSON-LD, sitemap extension, FAQ source-of-truth). Payload is read over HTTP by a thin, totally-guarded `lib/cms` client so the web app builds, typechecks, lints, and serves with NO CMS keys (empty states / static fallbacks, never a 500). Money rules don't apply (no money on these pages); dates use `formatDateIN` in `<time datetime>`. Verification uses `SKIP_ENV_VALIDATION=1 bun run typecheck` and `bun run lint` (Biome).

## Tasks

- [x] 1. CMS client foundation — config, types, guarded fetch, helpers (web)
  - Create `apps/web/src/lib/cms/config.ts`: `isCmsConfigured()` (true only when `process.env.CMS_URL` is a non-empty URL — read `process.env` directly, NOT `@/env`, to stay build-safe), `cmsBaseUrl(): string | null`, `CMS_REVALIDATE_SECONDS = 3600`, and `cmsFetch<T>(path, init?): Promise<T | null>` — returns `null` when unconfigured; wraps the `fetch` in try/catch returning `null` on network error / non-2xx / parse failure; applies `next: { revalidate: CMS_REVALIDATE_SECONDS }` for ISR; logs anomalies via `@rgss/logger` (`createLogger`)
  - Create `apps/web/src/lib/cms/types.ts`: view-model types `BlogListItem`, `BlogPost`, `GalleryImage`, `TeamMember`, `Banner`, `CmsFaq`, and `ResolvedMedia` (per the design's Data Models). No `any`
  - Create `apps/web/src/lib/cms/media.ts`: `resolveMedia(media: unknown): ResolvedMedia | null` — resolve a Payload upload doc/relation into `{ url, alt, width, height }`, prefixing relative URLs with `process.env.CLOUDFLARE_R2_PUBLIC_URL` (or `CMS_URL`) when needed; returns `null` for empty/unpopulated fields
  - Create `apps/web/src/lib/cms/richtext.ts`: `lexicalToHtml(root: unknown): string` (whitelist serialisation — NO arbitrary raw HTML passthrough, honour the no-unsanitised-`dangerouslySetInnerHTML` rule) and `lexicalToPlainText(root: unknown, maxLen?: number): string`; both return `''` on empty/invalid input
  - _Requirements: 7.1, 7.3_

- [x] 2. SEO builder extensions — BlogPosting + ImageObject (web)
  - Edit `apps/web/src/lib/seo/jsonld.ts`: add `blogPostingJsonLd(post: { title; description; slug; coverImageUrl?; authorName?; publishedAt; updatedAt? }): Record<string, unknown>` — `@context: 'https://schema.org'`, `@type: 'BlogPosting'`, non-empty `headline`, ISO-8601 `datePublished`/`dateModified`, `publisher` Organization from `BUSINESS` (name + logo), `author` Person(authorName) falling back to publisher, `image` when cover present, `mainEntityOfPage` = `${BUSINESS.url}/blog/${slug}`
  - Add `imageObjectJsonLd(image: { url; caption?; alt; width?; height? }): Record<string, unknown>` — `@type: 'ImageObject'`, non-empty `contentUrl`/`url`, `alt` carried into `caption`/`name`
  - Keep them pure (read `BUSINESS` only); they will be serialised by the existing `<JsonLd>` component (already `<`-escaped)
  - _Requirements: 5.1, 5.2, 5.4_

- [x] 3. Payload CMS app scaffold + collections (cms)
  - Build out `apps/cms` as a Payload CMS v3 Next.js app. Edit `apps/cms/package.json` (add `payload`, `@payloadcms/db-postgres`, `@payloadcms/richtext-lexical`, `@payloadcms/storage-s3`, `@payloadcms/next`, `next`, `react`, `react-dom`; add `dev`/`build`/`start`/`generate:types` scripts). Create `apps/cms/tsconfig.json` (strict, extends root), `apps/cms/next.config.ts` (wrap with `withPayload`), and `apps/cms/.env.example` (PAYLOAD_SECRET, DATABASE_URL, PAYLOAD_PUBLIC_SERVER_URL, WEB_APP_URL, CLOUDFLARE_R2_* )
  - Create `apps/cms/src/payload.config.ts`: `buildConfig` with `serverURL` from `PAYLOAD_PUBLIC_SERVER_URL`, `secret` from `PAYLOAD_SECRET`, `db: postgresAdapter({ pool: { connectionString: process.env.DATABASE_URL } })`, `editor: lexicalEditor({})`, `cors`/`csrf` = `[WEB_APP_URL]`, `s3Storage` plugin (bucket/endpoint/credentials/region 'auto'/forcePathStyle) bound to the `media` collection, `typescript: { outputFile: 'src/payload-types.ts' }`, and `collections: [Users, Media, Blog, Gallery, Team, Banner, Faq]`
  - Create `apps/cms/src/access/published.ts`: `anyoneReadsPublished` (anonymous read limited to `status === 'published'`; non-status collections world-readable) + `adminsWrite` (create/update/delete require authenticated user)
  - Create the collections under `apps/cms/src/collections/`: `Users.ts` (auth-enabled), `Media.ts` (upload, R2-backed, `alt` required, image type whitelist + size cap, image sizes thumbnail/card/hero), `Blog.ts` (title, slug unique+indexed auto-from-title, excerpt, coverImage→media, body richText, author→team relation, category select, tags, seo group {metaTitle, metaDescription, ogImage→media}, publishedAt date, status select draft|published default draft + access gating), `Gallery.ts` (image→media, alt required, caption, category, order), `Team.ts` (name, role, bio, photo→media, specializations array, order), `Banner.ts` (headline, image→media, ctaLabel, ctaHref, active checkbox, startAt, endAt, order), `Faq.ts` (question, answer, category, order)
  - Do NOT add `apps/cms` to `apps/web`'s `transpilePackages`; the web app must never import `payload`. This task creates config/collections only — running the admin/migrations is a deploy-time step (typecheck of the config is the gate here)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.2, 2.3_

- [x] 4. CMS client read functions (web)
  - Create `apps/web/src/lib/cms/client.ts` with total functions (never throw — return `[]`/`null` on any failure, mapping raw Payload docs → view-models via `media.ts`/`richtext.ts`):
    - `getPublishedPosts(opts?: { limit?; page? }): Promise<BlogListItem[]>` → `GET /blog?where[status][equals]=published&sort=-publishedAt&depth=1&limit&page`
    - `getPostBySlug(slug): Promise<BlogPost | null>` → `GET /blog?where[slug][equals]=…&where[status][equals]=published&depth=1&limit=1`
    - `getAllPostSlugs(): Promise<string[]>` → `GET /blog?where[status][equals]=published&depth=0&limit=200&select=slug`
    - `getGalleryImages(opts?: { category? }): Promise<GalleryImage[]>` → `GET /gallery?depth=1&sort=-createdAt`
    - `getTeamMembers(): Promise<TeamMember[]>` → `GET /team?depth=1&sort=order`
    - `getActiveBanners(now = new Date()): Promise<Banner[]>` → `GET /banner?where[active][equals]=true&depth=1&sort=order`, then filter the `[startAt, endAt]` window against `now` (absent bound = open-ended)
    - `getCmsFaqs(): Promise<CmsFaq[]>` → `GET /faq?depth=0&sort=order`
  - Skip any doc that cannot yield a slug/title (defensive mapping with safe defaults)
  - _Requirements: 2.1, 2.4, 7.2, 7.3_

- [x] 5. Blog + gallery pages and presentation components (web)
  - Create `apps/web/src/components/blog/PostCard.tsx` (presentation-only listing card), `apps/web/src/components/blog/RichText.tsx` (renders serialised Lexical via `lexicalToHtml`), `apps/web/src/components/gallery/GalleryGrid.tsx` (responsive grid; each image non-empty `alt` + explicit `width`/`height` or fill with reserved space). Match the `(customer)` chrome tokens
  - Create `apps/web/src/app/(customer)/blog/page.tsx`: `export const revalidate = 3600`; `getPublishedPosts()` → `PostCard`s or a friendly empty state; `buildMetadata({ title: 'Blog', path: '/blog', … })`; `<JsonLd data={[localBusinessJsonLd(), breadcrumbJsonLd([{name:'Home',url:SITE_URL},{name:'Blog'}])]} />`; single `h1`
  - Create `apps/web/src/app/(customer)/blog/[slug]/page.tsx`: `export const revalidate = 3600`; `generateStaticParams()` from `getAllPostSlugs()` (returns `[]` when CMS absent → on-demand render); `generateMetadata()` from the post (title/excerpt/cover OG, canonical `/blog/{slug}`) via `buildMetadata`; body via `<RichText/>`; `publishedAt` as `<time datetime="{ISO}">{formatDateIN(...)}</time>`; `<JsonLd data={[blogPostingJsonLd(...), breadcrumbJsonLd([Home, Blog, title])]} />`; `notFound()` when the post is missing/unpublished. `params` is a Promise (await it)
  - Create `apps/web/src/app/(customer)/gallery/page.tsx`: `export const revalidate = 3600`; `getGalleryImages()` → `GalleryGrid` or empty state; `buildMetadata({ title: 'Gallery', path: '/gallery', … })`; `breadcrumbJsonLd([Home, Gallery])` + one `imageObjectJsonLd(...)` per image; single `h1`
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 5.3, 7.2_

- [x] 6. Sitemap extension + FAQ source-of-truth + optional about/banner wiring (web)
  - Edit `apps/web/src/app/sitemap.ts`: keep the existing static + service-slug logic; append static `/blog` (weekly, 0.7) and `/gallery` (monthly, 0.5) entries, and one entry per slug from `getAllPostSlugs()` (`/blog/{slug}`, monthly, 0.7) inside a guard so an empty/failed CMS read leaves the Phase 7 output unchanged (never throws)
  - Create `apps/web/src/lib/cms/faqs.ts` (or add to client): `resolveFaqs(): Promise<Faq[]>` — return mapped `getCmsFaqs()` when non-empty, else the static `FAQS` from `@/lib/seo/business`; result always non-empty. Wire the FAQ page and homepage FAQPage JSON-LD to use `resolveFaqs()` (READ the existing `faq/page.tsx` and homepage first; if they currently import `FAQS` directly, swap to `resolveFaqs()` while keeping `FAQS` as the guaranteed fallback). Pages stay ISR/server components
  - OPTIONAL (only if low-risk): edit `apps/web/src/app/(customer)/about/page.tsx` to source the team list from `getTeamMembers()` falling back to the existing hard-coded `team` array when the CMS returns `[]`; render nothing extra on the homepage for banners unless trivially cheap via `getActiveBanners()`. Do NOT break existing about-page rendering
  - _Requirements: 6.1, 6.2, 8.1, 8.2_

- [x] 7. Verification — typecheck and lint (whole monorepo, no CMS keys)
  - Run `SKIP_ENV_VALIDATION=1 bun run typecheck` across the workspace; resolve all type errors in new files (no `any`, no `@ts-ignore` beyond a single justified guarded optional-dependency import if unavoidable). Force-fresh the web app if turbo caches: `cd apps/web; $env:SKIP_ENV_VALIDATION=1; bunx tsc --noEmit`. Typecheck `apps/cms` (`cd apps/cms; bunx tsc --noEmit`) — note Payload type generation (`payload generate:types`) needs real env and is deploy-time; if `src/payload-types.ts` isn't generatable here, model the minimal types the config references locally so the config still typechecks
  - Run `bun run lint` (Biome) and fix any genuine new issues (ignore the pre-existing CRLF / import-order / `useSemanticElements` baseline)
  - Confirm the web app builds/serves with NO CMS keys: `isCmsConfigured()` false → `/blog`, `/blog/[slug]`, `/gallery` render empty state / 404 without throwing; sitemap equals Phase 7 output; `resolveFaqs()` returns the static `FAQS`; the web app does NOT import `payload` and `apps/cms` is NOT in `transpilePackages`
  - _Requirements: 7.1, 7.2, 7.3_

## Notes

- **Payload is marketing content only.** It owns its own Neon tables (its adapter + migrations), disjoint from `@rgss/db` Drizzle. The web app reads published content over HTTP via `lib/cms` and NEVER imports `payload` or queries Payload tables; `apps/cms` is NOT added to `apps/web` `transpilePackages` (keeps the edge build clean — Payload needs Node).
- **Guarded extension point.** Read `CMS_URL` / `CLOUDFLARE_R2_PUBLIC_URL` via `process.env` directly behind truthy guards (NOT `@/env`, to avoid build-time validation). Every `lib/cms` function is total: returns `[]`/`null` + logs on unconfigured / network error / timeout / non-2xx / malformed; never throws. The whole monorepo typechecks/lints/builds with no CMS keys.
- **SEO reuse.** Extend Phase 7 surfaces — `lib/seo/jsonld.ts` (new `blogPostingJsonLd`/`imageObjectJsonLd`), reuse `buildMetadata`, `<JsonLd>`, `breadcrumbJsonLd`, `localBusinessJsonLd`, and the `BUSINESS` constant (single NAP/publisher source). JSON-LD stays server-rendered + `<`-escaped.
- **Dates.** No money on these pages. `publishedAt` rendered as `<time datetime="{ISO-8601}">{formatDateIN(date)}</time>` (DD/MM/YYYY, IST); JSON-LD uses raw ISO-8601.
- **ISR.** `/blog`, `/blog/[slug]`, `/gallery` use `export const revalidate = 3600` (time-based, ~1h per architecture.md). On-demand revalidation via a Payload `afterChange` webhook is a deferred enhancement.
- **Rich text.** Lexical serialised through a whitelist (`richtext.ts`), not raw HTML passthrough — upholds the XSS rule even for trusted authors.
- **FAQ source-of-truth.** CMS-preferred via `resolveFaqs()`, static `FAQS` fallback so FAQPage JSON-LD always has content.
- No test files committed unless requested. TypeScript strict, Biome style (single quotes, no semicolons, 2-space indent, trailing commas).
- Next.js 16: `params`/`searchParams` are Promises — await them.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2", "3"] },
    { "id": 1, "tasks": ["4"] },
    { "id": 2, "tasks": ["5", "6"] },
    { "id": 3, "tasks": ["7"] }
  ]
}
```

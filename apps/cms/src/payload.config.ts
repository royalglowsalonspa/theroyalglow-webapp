/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : payload.config
 * Scope        : CMS Configuration
 *
 * Description  : Root Payload CMS configuration wiring together the
 *                PostgreSQL adapter, Lexical editor, R2 storage, and
 *                all content collections.
 *
 * Responsibilities :
 * - Configure Neon PostgreSQL database adapter
 * - Set up Lexical rich-text editor
 * - Wire Cloudflare R2 via S3 storage plugin
 * - Register all CMS collections
 * - Configure CORS/CSRF for web app domain
 *
 * Features / Functionality :
 * - 12 collections: Users, Media, Blog, Gallery, Team, Banner, Faq,
 *                   Testimonial, Offer, ServiceCard, ServiceCategory, Service
 * - S3 storage (R2) for media uploads
 * - READ-ONLY MCP server at /api/mcp (plugin adds a 13th collection,
 *   `payload-mcp-api-keys`, for per-key capability control)
 * - TypeScript type generation
 *
 * Tech Stack   : Payload CMS v3, PostgreSQL, Cloudflare R2, MCP
 * Layer        : CMS (Configuration)
 *
 * Dependencies : @payloadcms/db-postgres, @payloadcms/richtext-lexical,
 *                @payloadcms/storage-s3, @payloadcms/plugin-mcp, payload
 *
 * Notes        :
 * - Hosted on Render (Singapore) at admin.theroyalglow.in
 * - DATABASE_URL points to Neon's pooled connection
 ************************************************************/
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { resendAdapter } from '@payloadcms/email-resend'
import { mcpPlugin } from '@payloadcms/plugin-mcp'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { Banner } from './collections/Banner'
import { Blog } from './collections/Blog'
import { Faq } from './collections/Faq'
import { Gallery } from './collections/Gallery'
import { Media } from './collections/Media'
import { Offer } from './collections/Offer'
import { Service } from './collections/Service'
import { ServiceCard } from './collections/ServiceCard'
import { ServiceCategory } from './collections/ServiceCategory'
import { Team } from './collections/Team'
import { Testimonial } from './collections/Testimonial'
import { Users } from './collections/Users'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const webAppUrl = process.env.WEB_APP_URL ?? ''

// R2 (S3) media storage is only enabled when fully configured. When any key is
// absent (e.g. local dev before R2 is set up), the plugin is disabled and
// Payload falls back to local-disk media storage so uploads still work.
const isR2Configured =
  (process.env.R2_BUCKET_NAME ?? '') !== '' &&
  (process.env.R2_ENDPOINT ?? '') !== '' &&
  (process.env.R2_ACCESS_KEY_ID ?? '') !== '' &&
  (process.env.R2_SECRET_ACCESS_KEY ?? '') !== ''

// Resend email is only enabled when RESEND_API_KEY is present. Without it,
// Payload falls back to the console "no email adapter" transport (fine for
// local dev) — password resets / admin invites just print to the log instead
// of being delivered. defaultFromAddress MUST be on a Resend-verified domain
// (theroyalglow.in) or sends will be rejected.
const resendApiKey = process.env.RESEND_API_KEY ?? ''
const isEmailConfigured = resendApiKey !== ''

export default buildConfig({
  serverURL: process.env.PAYLOAD_PUBLIC_SERVER_URL ?? '',
  secret: process.env.PAYLOAD_SECRET ?? '',
  // Spread the `email` key only when configured. Under
  // `exactOptionalPropertyTypes`, an optional property cannot be set to an
  // explicit `undefined`, so omit it entirely when email is disabled.
  ...(isEmailConfigured
    ? {
        email: resendAdapter({
          defaultFromAddress: process.env.RESEND_FROM_ADDRESS ?? 'contact@theroyalglow.in',
          defaultFromName: process.env.RESEND_FROM_NAME ?? 'Royal Glow Salon & Spa',
          apiKey: resendApiKey,
        }),
      }
    : {}),
  admin: {
    user: Users.slug,
  },
  sharp,
  editor: lexicalEditor({}),
  db: postgresAdapter({
    // Isolate all Payload tables in a dedicated `cms` Postgres schema so they
    // never collide with the app's Drizzle tables in `public` (e.g. both define
    // a `service` table).
    schemaName: 'cms',
    // Disable dev-mode auto schema push. Push introspects the whole database
    // and breaks against Postgres 18 + the app's large existing `public` schema
    // (infinite "Pulling schema from database"; see Payload #8031 / #13963).
    // We use migrations instead — also the correct approach for prod (Render).
    push: false,
    pool: {
      connectionString: process.env.DATABASE_URL ?? '',
    },
  }),
  collections: [
    Users,
    Media,
    Blog,
    Gallery,
    Team,
    Banner,
    Faq,
    Testimonial,
    Offer,
    ServiceCard,
    // ServiceCategory MUST precede Service: `Service.categoryId` targets
    // `relationTo: 'service_category'`. Payload resolves relationships after
    // sanitizing every collection, so order is not strictly required — but
    // registering the target first makes the dependency obvious to readers.
    ServiceCategory,
    Service,
  ],
  cors: [webAppUrl],
  csrf: [webAppUrl],
  plugins: [
    s3Storage({
      enabled: isR2Configured,
      collections: {
        // All Payload-managed media is stored under the `cms/` key prefix
        // (R2 "folder") to keep it separate from other app uploads
        // (e.g. future `website/`, `invoices/` prefixes used outside Payload).
        media: {
          prefix: 'cms',
        },
      },
      bucket: process.env.R2_BUCKET_NAME ?? '',
      config: {
        endpoint: process.env.R2_ENDPOINT ?? '',
        region: 'auto',
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
        },
        forcePathStyle: true,
      },
    }),
    /*
     * MCP (Model Context Protocol) server — exposed at `/api/mcp` through
     * Payload's REST catch-all route (`src/app/(payload)/api/[...slug]`).
     *
     * READ-ONLY BY DESIGN. Every collection below declares
     * `enabled: { find: true }` and nothing else. `create`, `update`, and
     * `delete` are withheld deliberately — do NOT add them casually:
     *
     *  - `service` and `service_category` carry `afterChange` sync hooks
     *    (`syncServiceToPublic` / `syncServiceCategoryToPublic`) that mirror
     *    every write into `public.service` and `public.service_category` — the
     *    LIVE booking catalogue customers book against. A model granted write
     *    access here could silently change real prices (paise) and durations
     *    on bookable services, and those writes propagate straight to the
     *    booking engine.
     *  - The remaining collections are marketing/content surfaces the website
     *    renders. Read access is enough for every use case we have (answering
     *    questions about content, auditing, drafting copy elsewhere).
     *
     * `users` is DELIBERATELY EXCLUDED. It is Payload's auth collection and
     * holds password `hash`/`salt` plus admin PII. It must not be reachable
     * over MCP at all — not even `find`.
     *
     * There are no globals in this config, so `globals` is omitted.
     *
     * TWO-STEP ACCESS MODEL (per the plugin docs): enabling a capability here
     * is necessary but NOT sufficient. Each capability must ALSO be toggled on
     * the individual API Key in the admin panel under MCP → API Keys. Widening
     * access therefore requires BOTH a change to this config AND an explicit
     * per-key toggle — keep it that way.
     *
     * Collection `description`s are intentionally specific: the description is
     * the primary signal a model uses to pick the right tool. Vague
     * descriptions cause wrong-tool calls.
     */
    mcpPlugin({
      collections: {
        service: {
          enabled: { find: true },
          description:
            'The operational, BOOKABLE service catalogue for Royal Glow Salon & Spa. Each document is a service a customer can book: name, slug, description, categoryId (relationship to service_category), durationMinutes (fixed set: 15/30/45/60/90/120/150/180), bufferMinutes (clean-up time after the service), pricePaise (GST-inclusive price in PAISE — 149900 means ₹1,499.00), isActive (false = retired, services are deactivated never deleted), imageUrl, displayOrder, and the gems loyalty fields gemsRedeemable / gemsRequired / gemsCatalogueOrder. These records are MIRRORED into the booking engine database (public.service) by an afterChange sync hook, so this is live operational data, not marketing copy. Use it to answer questions about what services exist, their prices, and their durations.',
        },
        service_category: {
          enabled: { find: true },
          description:
            'Bookable service CATEGORIES that group the services in the `service` collection — e.g. "Hair Care", "Body Massage", "Bridal". Fields: name, slug, description, serviceType ("salon" or "spa" — a single booking may only contain services of one type), displayOrder, isActive. Mirrored to the booking engine database (public.service_category). Use it to understand the Salon/SPA taxonomy behind the bookable catalogue.',
        },
        'service-card': {
          enabled: { find: true },
          description:
            'Homepage MARKETING category cards for the "See what Royal Glow can do for you" scroll row (Hair, Spa, Bridal, Nails, ...). Display-only and NOT bookable — distinct from the `service` / `service_category` collections. Fields: name, fromPrice (a display string like "₹1,499", not paise), image + imageAlt, bookingHref (where the "Book →" CTA points), active, order.',
        },
        blog: {
          enabled: { find: true },
          description:
            'Blog posts for the Royal Glow website (/blog and /blog/[slug]). Fields: title, slug, excerpt, coverImage, body (Lexical rich text — large, prefer `select` to skip it), author (relationship to team), category (skincare | hair | spa | bridal | tips), tags, an seo group (metaTitle, metaDescription, ogImage), publishedAt, and status (draft | published). Use it to find beauty/wellness editorial content and its publication state.',
        },
        gallery: {
          enabled: { find: true },
          description:
            'Curated gallery images shown on the /gallery page. Fields: image (upload to media), alt (required, accessibility), caption, category (salon | spa | interior | team | work), order. Use it to find which photographs are published and how they are categorised.',
        },
        team: {
          enabled: { find: true },
          description:
            'Public team member profiles surfaced on /about, and referenced as the author of blog posts. Fields: name, role, bio, photo, specializations (array of skill tags), order. This is public-facing marketing content — it is NOT the staff/HR records or the auth users collection.',
        },
        banner: {
          enabled: { find: true },
          description:
            'Homepage promotional ANNOUNCEMENT banners. Fields: headline, image, ctaLabel, ctaHref, active, startAt / endAt (optional scheduling window applied by the web client), order. Narrower than the `offer` collection — banners are a headline plus a link, offers are full discount cards.',
        },
        faq: {
          enabled: { find: true },
          description:
            'CMS-managed FAQ entries powering the /faq page and its FAQPage JSON-LD (the preferred source over the static fallback list). Fields: question, answer (answer-first phrasing), category (booking | pricing | services | policies), order. Use it to find the official published answers to common customer questions.',
        },
        testimonial: {
          enabled: { find: true },
          description:
            'Customer reviews shown in the homepage testimonial carousel. Fields: reviewerName, rating (1–5 stars), reviewText, timeLabel (a human string such as "1 week ago", displayed as-is), active, order.',
        },
        offer: {
          enabled: { find: true },
          description:
            'Promotional OFFER cards shown on the homepage and /offers page. Fields: title, description, discountLabel (badge text such as "20% OFF" or "Buy 2 Get 1 Free"), image, ctaLabel / ctaHref, category (all | salon | spa | bridal | nails | skincare), active, validFrom / validUntil, order. This is marketing content only — actual discount application and per-booking redemption live in the separate Drizzle `offer` tables, not here.',
        },
        media: {
          enabled: { find: true },
          description:
            'The shared UPLOAD collection backing every image referenced by the other collections, stored in Cloudflare R2. Restricted to JPEG/PNG/WebP with a 10 MB cap, and generates thumbnail (400px), card (800px), and hero (1600px) sizes. Fields include the required alt text plus Payload upload metadata (filename, mimeType, filesize, width, height, url, sizes). Use it to resolve an image reference to its URL or alt text.',
        },
        // `users` is intentionally absent — see the comment above.
      },
      mcp: {
        handlerOptions: {
          verboseLogs: false,
        },
        serverOptions: {
          serverInfo: {
            name: 'Royal Glow Payload MCP',
            version: '1.0.0',
          },
        },
      },
    }),
  ],
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})

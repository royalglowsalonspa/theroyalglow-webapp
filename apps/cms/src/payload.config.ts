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
 * - 11 collections: Users, Media, Blog, Gallery, Team, Banner, Faq,
 *                   Testimonial, Offer, ServiceCard, Service
 * - S3 storage (R2) for media uploads
 * - TypeScript type generation
 *
 * Tech Stack   : Payload CMS v3, PostgreSQL, Cloudflare R2
 * Layer        : CMS (Configuration)
 *
 * Dependencies : @payloadcms/db-postgres, @payloadcms/richtext-lexical,
 *                @payloadcms/storage-s3, payload
 *
 * Notes        :
 * - Hosted on Render (Singapore) at admin.theroyalglow.in
 * - DATABASE_URL points to Neon's pooled connection
 ************************************************************/
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { resendAdapter } from '@payloadcms/email-resend'
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
  ],
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})

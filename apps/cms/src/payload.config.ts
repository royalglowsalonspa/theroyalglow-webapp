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
 * - 10 collections: Users, Media, Blog, Gallery, Team, Banner, Faq,
 *                   Testimonial, Offer, ServiceCard
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
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { buildConfig } from 'payload'
import { Banner } from './collections/Banner'
import { Blog } from './collections/Blog'
import { Faq } from './collections/Faq'
import { Gallery } from './collections/Gallery'
import { Media } from './collections/Media'
import { Offer } from './collections/Offer'
import { ServiceCard } from './collections/ServiceCard'
import { Team } from './collections/Team'
import { Testimonial } from './collections/Testimonial'
import { Users } from './collections/Users'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const webAppUrl = process.env.WEB_APP_URL ?? ''

export default buildConfig({
  serverURL: process.env.PAYLOAD_PUBLIC_SERVER_URL ?? '',
  secret: process.env.PAYLOAD_SECRET ?? '',
  admin: {
    user: Users.slug,
  },
  editor: lexicalEditor({}),
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL ?? '',
    },
  }),
  collections: [Users, Media, Blog, Gallery, Team, Banner, Faq, Testimonial, Offer, ServiceCard],
  cors: [webAppUrl],
  csrf: [webAppUrl],
  plugins: [
    s3Storage({
      collections: {
        media: true,
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

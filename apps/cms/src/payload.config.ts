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
import { Team } from './collections/Team'
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
  collections: [Users, Media, Blog, Gallery, Team, Banner, Faq],
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

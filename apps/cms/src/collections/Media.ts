import type { CollectionConfig } from 'payload'
import { adminsWrite, anyoneReads } from '../access/published'

/**
 * Shared upload collection backed by the Cloudflare R2 S3 storage adapter
 * (wired in `payload.config.ts`). Constrains uploads to an image whitelist
 * and a 10 MB cap per the project's file-upload security rule, and defines
 * responsive image sizes for the web app's `<Image>` usage.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: anyoneReads,
    create: adminsWrite,
    update: adminsWrite,
    delete: adminsWrite,
  },
  upload: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    imageSizes: [
      { name: 'thumbnail', width: 400, height: undefined },
      { name: 'card', width: 800, height: undefined },
      { name: 'hero', width: 1600, height: undefined },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
}

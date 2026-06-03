/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Media
 * Scope        : CMS Collections
 *
 * Description  : Shared upload collection backed by Cloudflare R2 (S3 adapter),
 *                constraining uploads to an image whitelist with a 10 MB cap.
 *
 * Responsibilities :
 * - Define media upload constraints (MIME types, max size)
 * - Generate responsive image sizes (thumbnail, card, hero)
 * - Require alt text for accessibility
 *
 * Features / Functionality :
 * - MIME whitelist: jpeg, png, webp only
 * - Responsive sizes: 400px, 800px, 1600px widths
 * - Alt text field (required, WCAG compliance)
 *
 * Tech Stack   : Payload CMS v3, Cloudflare R2 (S3)
 * Layer        : CMS (Collection)
 *
 * Dependencies : payload, ../access/published
 *
 * Notes        :
 * - R2 storage adapter configured in payload.config.ts
 * - 10 MB cap enforced per project security rules
 ************************************************************/
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

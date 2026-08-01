/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 01-08-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Banner
 * Scope        : CMS Collections
 *
 * Description  : Payload CMS collection for homepage promotional banners
 *                with time-window activation and ordering. Feeds TWO
 *                independent surfaces: the homepage hero image and the
 *                site-wide announcement strip.
 *
 * Responsibilities :
 * - Define banner schema (headline, image, CTA, scheduling)
 * - Enforce access control (world-readable, admin writable)
 * - Document the hero / announcement split for the editor via admin.description
 *
 * Features / Functionality :
 * - Headline + image + CTA link
 * - Active/inactive toggle with optional date window
 * - Display ordering field
 *
 * Tech Stack   : Payload CMS v3
 * Layer        : CMS (Collection)
 *
 * Dependencies : payload, ../access/published
 *
 * Notes        :
 * - Active-window filtering (startAt/endAt) is applied client-side by web app
 * - The two consumers are DECOUPLED by the CTA link, with no extra field:
 *   `image` always drives the homepage hero, while the announcement strip only
 *   shows a banner whose `ctaHref` is non-empty (an announcement needs somewhere
 *   to click). So a banner with a blank CTA link swaps the hero photo ONLY and
 *   leaves the strip on its hardcoded fallback copy. Selection lives in
 *   `apps/web/src/lib/cms/banners.ts` (selectHeroBanner /
 *   selectAnnouncementBanner); `order` breaks ties when several are active.
 * - The `admin.description` strings below are Admin-UI helper text only — they
 *   add no column and require no migration.
 ************************************************************/
import type { CollectionConfig } from 'payload'
import { adminsWrite, anyoneReads } from '../access/published'
import { revalidateHooks } from '../hooks/revalidate'

/**
 * Homepage promo banners. World-readable; the active-window check
 * (`active` + `[startAt, endAt]`) is applied by the web client.
 *
 * One record, two consumers, split by the CTA link: `image` → homepage hero,
 * `headline` + `ctaHref` → site-wide announcement strip (skipped when `ctaHref`
 * is blank).
 */
export const Banner: CollectionConfig = {
  slug: 'banner',
  hooks: revalidateHooks('banner'),
  access: {
    read: anyoneReads,
    create: adminsWrite,
    update: adminsWrite,
    delete: adminsWrite,
  },
  admin: {
    useAsTitle: 'headline',
    defaultColumns: ['headline', 'active', 'order'],
    group: 'Marketing',
  },
  fields: [
    {
      name: 'headline',
      type: 'text',
      required: true,
      admin: {
        description:
          'Shown in the announcement strip across the top of the site — but only when the CTA link below is filled in.',
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: {
        description:
          'Drives the homepage hero photo. This happens whether or not the CTA link is filled in.',
      },
    },
    {
      name: 'ctaLabel',
      type: 'text',
    },
    {
      name: 'ctaHref',
      type: 'text',
      admin: {
        description:
          'Internal path or absolute URL. LEAVE BLANK and this banner will NOT appear in the top announcement strip — it only changes the homepage hero photo. Fill it in and the headline above also runs as the announcement.',
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      required: true,
      defaultValue: false,
      admin: {
        description:
          'Only active banners are used, and only inside the optional start/end window below.',
      },
    },
    {
      name: 'startAt',
      type: 'date',
    },
    {
      name: 'endAt',
      type: 'date',
    },
    {
      name: 'order',
      type: 'number',
      admin: {
        description:
          'Lowest number wins when several banners are active: it supplies the hero photo, and the lowest-numbered one with a CTA link supplies the announcement strip.',
      },
    },
  ],
}

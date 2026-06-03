/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Banner
 * Scope        : CMS Collections
 *
 * Description  : Payload CMS collection for homepage promotional banners
 *                with time-window activation and ordering.
 *
 * Responsibilities :
 * - Define banner schema (headline, image, CTA, scheduling)
 * - Enforce access control (world-readable, admin writable)
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
 ************************************************************/
import type { CollectionConfig } from 'payload'
import { adminsWrite, anyoneReads } from '../access/published'

/**
 * Homepage promo banners. World-readable; the active-window check
 * (`active` + `[startAt, endAt]`) is applied by the web client.
 */
export const Banner: CollectionConfig = {
  slug: 'banner',
  access: {
    read: anyoneReads,
    create: adminsWrite,
    update: adminsWrite,
    delete: adminsWrite,
  },
  admin: {
    useAsTitle: 'headline',
    defaultColumns: ['headline', 'active', 'order'],
  },
  fields: [
    {
      name: 'headline',
      type: 'text',
      required: true,
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: true,
    },
    {
      name: 'ctaLabel',
      type: 'text',
    },
    {
      name: 'ctaHref',
      type: 'text',
      admin: {
        description: 'Internal path or absolute URL.',
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      required: true,
      defaultValue: false,
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
    },
  ],
}

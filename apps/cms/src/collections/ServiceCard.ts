/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 08-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ServiceCard
 * Scope        : CMS Collections
 *
 * Description  : Payload CMS collection for the "See what Royal Glow can do
 *                for you" homepage service category cards. Replaces the
 *                hardcoded array so the marketing team can update service
 *                names, starting prices, images, and links without code.
 *
 * Responsibilities :
 * - Define service card schema (name, from-price, image, link, order)
 * - Provide world-readable access, admin-only writes
 * - Control display order and visibility
 *
 * Features / Functionality :
 * - Service name, starting price (display string), hero image
 * - Anchor link for the "Book →" CTA
 * - Active toggle and display order
 *
 * Tech Stack   : Payload CMS v3
 * Layer        : CMS (Collection)
 *
 * Dependencies : payload, ../access/published
 *
 * Notes        :
 * - Distinct from the Drizzle `service` table (which holds bookable services
 *   with paise prices and staff assignments). This is display/marketing data.
 * - Web app fetches with ISR (1h revalidation) since prices rarely change.
 ************************************************************/
import type { CollectionConfig } from 'payload'
import { adminsWrite, anyoneReads } from '../access/published'
import { revalidateHooks } from '../hooks/revalidate'

export const ServiceCard: CollectionConfig = {
  slug: 'service-card',
  hooks: revalidateHooks('service-card'),
  access: {
    read: anyoneReads,
    create: adminsWrite,
    update: adminsWrite,
    delete: adminsWrite,
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'fromPrice', 'active', 'order'],
    description: 'Homepage service category cards (Hair, Spa, Bridal, Nails, etc.).',
    group: 'Marketing',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: 'Service Name',
      admin: {
        description: 'E.g. "Hair", "Spa", "Bridal"',
      },
    },
    {
      name: 'fromPrice',
      type: 'text',
      required: true,
      label: 'Starting Price (display)',
      admin: {
        description: 'Display string shown on the card. E.g. "₹500", "₹1,499"',
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: true,
      label: 'Card Image',
    },
    {
      name: 'imageAlt',
      type: 'text',
      label: 'Image Alt Text',
      admin: {
        description: 'Descriptive text for screen readers and SEO.',
      },
    },
    {
      name: 'bookingHref',
      type: 'text',
      required: true,
      defaultValue: '/?book=1',
      label: 'Book CTA Link',
      admin: {
        description: 'Where the "Book →" button links. Use anchor IDs like /services#spa.',
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      label: 'Active (show on homepage)',
    },
    {
      name: 'order',
      type: 'number',
      label: 'Display Order',
      admin: {
        description: 'Lower numbers appear first in the scroll row.',
      },
    },
  ],
}

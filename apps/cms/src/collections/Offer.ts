/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 08-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Offer
 * Scope        : CMS Collections
 *
 * Description  : Payload CMS collection for special promotional offers and
 *                deals shown on the homepage and /offers page. Separate from
 *                the announcement Banner — these are full offer cards with
 *                images, discount details, and validity windows.
 *
 * Responsibilities :
 * - Define offer schema (title, description, image, discount, validity)
 * - Active/inactive toggle with optional date window
 * - Category classification (Salon / SPA) for filtering
 * - Display ordering on the homepage section
 *
 * Features / Functionality :
 * - Title, description, hero image, CTA link
 * - Discount label (e.g. "20% OFF", "₹500 off", "Buy 2 Get 1")
 * - Valid-from / valid-until date fields for auto-expiry logic
 * - Active toggle for manual control
 * - Service category for filtering on /offers page
 *
 * Tech Stack   : Payload CMS v3
 * Layer        : CMS (Collection)
 *
 * Dependencies : payload, ../access/published
 *
 * Notes        :
 * - Separate from the DB `offer` table (which tracks per-booking redemptions)
 * - This is marketing content only; actual discount application is in Drizzle
 ************************************************************/
import type { CollectionConfig } from 'payload'
import { adminsWrite, anyoneReads } from '../access/published'
import { revalidateHooks } from '../hooks/revalidate'

export const Offer: CollectionConfig = {
  slug: 'offer',
  hooks: revalidateHooks('offer'),
  access: {
    read: anyoneReads,
    create: adminsWrite,
    update: adminsWrite,
    delete: adminsWrite,
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'discountLabel', 'category', 'active', 'validUntil'],
    description: 'Promotional offer cards shown on homepage and /offers page.',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Offer Title',
      admin: {
        description: 'E.g. "20% OFF All Facials — This week only!"',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Short Description',
      admin: {
        description: '1-2 lines shown on the offer card.',
      },
    },
    {
      name: 'discountLabel',
      type: 'text',
      label: 'Discount Label',
      admin: {
        description: 'E.g. "20% OFF", "₹500 off", "Buy 2 Get 1 Free". Shown as a badge.',
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: true,
      label: 'Offer Image',
    },
    {
      name: 'ctaLabel',
      type: 'text',
      defaultValue: 'Book Now',
      label: 'CTA Button Label',
    },
    {
      name: 'ctaHref',
      type: 'text',
      defaultValue: '/?book=1',
      label: 'CTA Link',
      admin: {
        description: 'Internal path or full URL. Default opens the booking dialog.',
      },
    },
    {
      name: 'category',
      type: 'select',
      options: [
        { label: 'All Services', value: 'all' },
        { label: 'Salon', value: 'salon' },
        { label: 'SPA', value: 'spa' },
        { label: 'Bridal', value: 'bridal' },
        { label: 'Nails', value: 'nails' },
        { label: 'Skincare', value: 'skincare' },
      ],
      defaultValue: 'all',
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      required: true,
      label: 'Active (visible on website)',
    },
    {
      name: 'validFrom',
      type: 'date',
      label: 'Valid From',
      admin: {
        description: 'Leave blank to show immediately.',
      },
    },
    {
      name: 'validUntil',
      type: 'date',
      label: 'Valid Until',
      admin: {
        description: 'Leave blank for no expiry. Web app filters by this date.',
      },
    },
    {
      name: 'order',
      type: 'number',
      label: 'Display Order',
      admin: {
        description: 'Lower numbers appear first.',
      },
    },
  ],
}

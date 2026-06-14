/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 08-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Service
 * Scope        : CMS Collections
 *
 * Description  : Payload CMS collection for the customer-facing services
 *                catalogue on /services. Separate from the Drizzle `service`
 *                table used by the booking engine — this is display/marketing
 *                data the owner manages without code changes.
 *
 * Responsibilities :
 * - Define service schema (name, type, category, image, duration, price)
 * - Optional bookingRef to bridge to the booking engine
 * - Active/featured toggles and display ordering
 *
 * Features / Functionality :
 * - Salon vs SPA type classification
 * - Category grouping (Hair, Skin, Massage, etc.)
 * - Price stored in paise; formatted on the web app via formatINR
 * - "Book this" deep-link via bookingRef
 *
 * Tech Stack   : Payload CMS v3
 * Layer        : CMS (Collection)
 *
 * Dependencies : payload, ../access/published
 *
 * Notes        :
 * - bookingRef is optional — empty opens generic /?book=1 dialog.
 * - Run payload migrate:create + migrate after adding this collection.
 ************************************************************/
import type { CollectionConfig } from 'payload'
import { adminsWrite, anyoneReads } from '../access/published'

export const Service: CollectionConfig = {
  slug: 'service',
  access: {
    read: anyoneReads,
    create: adminsWrite,
    update: adminsWrite,
    delete: adminsWrite,
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'type', 'category', 'active', 'order'],
    description: 'Detailed service catalogue for the /services page (Salon and SPA).',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: 'Service Name',
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'Salon', value: 'salon' },
        { label: 'SPA', value: 'spa' },
      ],
    },
    {
      name: 'category',
      type: 'select',
      options: [
        { label: 'Hair', value: 'hair' },
        { label: 'Skin', value: 'skin' },
        { label: 'Nails', value: 'nails' },
        { label: 'Bridal', value: 'bridal' },
        { label: 'Massage', value: 'massage' },
        { label: 'Facial', value: 'facial' },
        { label: 'Grooming', value: 'grooming' },
        { label: 'Waxing', value: 'waxing' },
        { label: 'Makeup', value: 'makeup' },
        { label: 'Other', value: 'other' },
      ],
      admin: {
        description: 'Used to group services on the /services page.',
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: true,
      label: 'Thumbnail Image',
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Short Description',
    },
    {
      name: 'durationMinutes',
      type: 'number',
      required: true,
      label: 'Duration (minutes)',
      min: 5,
      admin: {
        description: 'Shown as "45 min" on the service card.',
      },
    },
    {
      name: 'pricePaise',
      type: 'number',
      required: true,
      label: 'Price (paise)',
      min: 0,
      admin: {
        description: 'Store in paise (e.g. 149900 = ₹1,499). Display formatted on the website.',
      },
    },
    {
      name: 'bookingRef',
      type: 'text',
      label: 'Booking Reference',
      admin: {
        description:
          'Optional id/slug linking to the booking engine. Leave blank to open the generic booking dialog.',
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      label: 'Active (visible on website)',
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
      label: 'Featured (optional homepage surfacing)',
    },
    {
      name: 'order',
      type: 'number',
      label: 'Display Order',
      admin: {
        description: 'Lower numbers appear first within their category.',
      },
    },
  ],
}

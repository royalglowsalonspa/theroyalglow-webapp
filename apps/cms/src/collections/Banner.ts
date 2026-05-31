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

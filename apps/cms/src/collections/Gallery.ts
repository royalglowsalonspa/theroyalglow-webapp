import type { CollectionConfig } from 'payload'
import { adminsWrite, anyoneReads } from '../access/published'

/** Gallery images shown on `/gallery`. World-readable; admin writes. */
export const Gallery: CollectionConfig = {
  slug: 'gallery',
  access: {
    read: anyoneReads,
    create: adminsWrite,
    update: adminsWrite,
    delete: adminsWrite,
  },
  admin: {
    useAsTitle: 'alt',
    defaultColumns: ['alt', 'category', 'order'],
  },
  fields: [
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: true,
    },
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    {
      name: 'caption',
      type: 'text',
    },
    {
      name: 'category',
      type: 'select',
      options: [
        { label: 'Salon', value: 'salon' },
        { label: 'Spa', value: 'spa' },
        { label: 'Interior', value: 'interior' },
        { label: 'Team', value: 'team' },
        { label: 'Work', value: 'work' },
      ],
    },
    {
      name: 'order',
      type: 'number',
    },
  ],
}

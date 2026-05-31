import type { CollectionConfig } from 'payload'
import { adminsWrite, anyoneReads } from '../access/published'

/** CMS-managed FAQ entries — the preferred source over the static FAQS list. */
export const Faq: CollectionConfig = {
  slug: 'faq',
  access: {
    read: anyoneReads,
    create: adminsWrite,
    update: adminsWrite,
    delete: adminsWrite,
  },
  admin: {
    useAsTitle: 'question',
    defaultColumns: ['question', 'category', 'order'],
  },
  fields: [
    {
      name: 'question',
      type: 'text',
      required: true,
    },
    {
      name: 'answer',
      type: 'textarea',
      required: true,
      admin: {
        description: 'Answer-first phrasing per the SEO guidelines.',
      },
    },
    {
      name: 'category',
      type: 'select',
      options: [
        { label: 'Booking', value: 'booking' },
        { label: 'Pricing', value: 'pricing' },
        { label: 'Services', value: 'services' },
        { label: 'Policies', value: 'policies' },
      ],
    },
    {
      name: 'order',
      type: 'number',
    },
  ],
}

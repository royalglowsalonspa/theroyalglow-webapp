import type { CollectionConfig, FieldHook } from 'payload'
import { adminsWrite, anyoneReadsPublished } from '../access/published'

/** Convert an arbitrary string into a kebab-case slug. */
const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * Auto-fill the slug from the title when no slug is provided, and normalise
 * any author-entered slug to kebab-case. Editors may still override it.
 */
const formatSlug: FieldHook = ({ value, data }) => {
  if (typeof value === 'string' && value.length > 0) {
    return slugify(value)
  }

  const title = data?.title
  if (typeof title === 'string' && title.length > 0) {
    return slugify(title)
  }

  return value
}

/**
 * Blog posts. Anonymous reads are limited to `status === 'published'`;
 * writes require an authenticated Payload user.
 */
export const Blog: CollectionConfig = {
  slug: 'blog',
  access: {
    read: anyoneReadsPublished,
    create: adminsWrite,
    update: adminsWrite,
    delete: adminsWrite,
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'status', 'publishedAt'],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description: 'Auto-generated from the title; kebab-case. Editable.',
      },
      hooks: {
        beforeValidate: [formatSlug],
      },
    },
    {
      name: 'excerpt',
      type: 'textarea',
      required: true,
      admin: {
        description:
          'Used in the listing and as the meta-description fallback (≤ 200 chars recommended).',
      },
    },
    {
      name: 'coverImage',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'body',
      type: 'richText',
      required: true,
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'team',
    },
    {
      name: 'category',
      type: 'select',
      options: [
        { label: 'Skincare', value: 'skincare' },
        { label: 'Hair', value: 'hair' },
        { label: 'Spa', value: 'spa' },
        { label: 'Bridal', value: 'bridal' },
        { label: 'Tips', value: 'tips' },
      ],
    },
    {
      name: 'tags',
      type: 'text',
      hasMany: true,
    },
    {
      name: 'seo',
      type: 'group',
      fields: [
        {
          name: 'metaTitle',
          type: 'text',
        },
        {
          name: 'metaDescription',
          type: 'textarea',
        },
        {
          name: 'ogImage',
          type: 'upload',
          relationTo: 'media',
        },
      ],
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: {
        description: 'Required when published; controls listing order.',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ],
    },
  ],
}

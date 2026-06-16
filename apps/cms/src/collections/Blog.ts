/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Blog
 * Scope        : CMS Collections
 *
 * Description  : Payload CMS collection for blog posts with auto-slug
 *                generation, SEO fields, and draft/published status.
 *
 * Responsibilities :
 * - Define blog post schema (title, body, cover, SEO, category)
 * - Auto-generate slug from title (kebab-case)
 * - Gate anonymous reads to published posts only
 *
 * Features / Functionality :
 * - Rich text body via Lexical editor
 * - Cover image (R2), author relationship, tags
 * - SEO group (metaTitle, metaDescription, ogImage)
 * - Draft/Published lifecycle
 *
 * Tech Stack   : Payload CMS v3, Lexical Editor
 * Layer        : CMS (Collection)
 *
 * Dependencies : payload, ../access/published
 *
 * Notes        :
 * - Blog posts fetched by web app via ISR (1h revalidation)
 * - Slug is auto-generated but editable by content team
 ************************************************************/
import type { CollectionConfig, FieldHook } from 'payload'
import { adminsWrite, anyoneReadsPublished } from '../access/published'
import { revalidateHooks } from '../hooks/revalidate'

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
  hooks: revalidateHooks('blog'),
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

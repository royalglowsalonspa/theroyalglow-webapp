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
 * - A punctuation-only / emoji-only title reduces to no ASCII alphanumerics, so
 *   the slug falls back to a deterministic `post-{hash}` rather than '' (an
 *   empty slug breaks URL generation and collides across rows)
 ************************************************************/
import type { CollectionConfig, FieldHook } from 'payload'
import { adminsWrite, anyoneReadsPublished } from '../access/published'
import { revalidateHooks } from '../hooks/revalidate'

/**
 * Deterministic 31-bit polynomial hash of a string, rendered base36. Same input
 * always yields the same suffix — no randomness, no clock — so a slug derived
 * from it is reproducible across saves, environments and re-imports.
 */
const stableSuffix = (value: string): string => {
  let hash = 0
  for (const char of value) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 2_147_483_647
  }
  return hash.toString(36)
}

/**
 * Convert an arbitrary string into a kebab-case slug.
 *
 * A title made only of punctuation, whitespace or unmapped scripts ("!!!", "---",
 * "🎉") has no ASCII alphanumerics to keep, so the kebab-case reduction alone
 * would return '' — an unusable URL, and one that every such title shares. Those
 * inputs fall back to `post-{stableSuffix}`: URL-safe, never empty, derived only
 * from the input (so re-saving a post never changes its URL) and distinct for
 * distinct titles. Uniqueness itself is still enforced by the `slug` field
 * (`unique: true, index: true`); the fallback only has to be non-empty, stable
 * and collision-averse.
 */
const slugify = (value: string): string => {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || `post-${stableSuffix(value)}`
}

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
    group: 'Content',
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

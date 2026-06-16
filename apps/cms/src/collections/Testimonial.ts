/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 08-06-2026 & Updated - 08-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Testimonial
 * Scope        : CMS Collections
 *
 * Description  : Payload CMS collection for customer testimonials displayed
 *                on the homepage carousel. Replaces hardcoded review data so
 *                the marketing team can add/remove real reviews without code.
 *
 * Responsibilities :
 * - Define testimonial schema (reviewer, rating, review text, date label)
 * - Provide world-readable access, admin-only writes
 * - Control display order for the homepage carousel
 *
 * Features / Functionality :
 * - Reviewer name, star rating (1-5), review text
 * - Human-readable time label (e.g. "1 week ago")
 * - Active toggle to show/hide without deletion
 * - Display order for carousel sequence
 *
 * Tech Stack   : Payload CMS v3
 * Layer        : CMS (Collection)
 *
 * Dependencies : payload, ../access/published
 *
 * Notes        :
 * - Web app fetches this collection at build time (ISR) for the carousel
 ************************************************************/
import type { CollectionConfig } from 'payload'
import { adminsWrite, anyoneReads } from '../access/published'
import { revalidateHooks } from '../hooks/revalidate'

export const Testimonial: CollectionConfig = {
  slug: 'testimonial',
  hooks: revalidateHooks('testimonial'),
  access: {
    read: anyoneReads,
    create: adminsWrite,
    update: adminsWrite,
    delete: adminsWrite,
  },
  admin: {
    useAsTitle: 'reviewerName',
    defaultColumns: ['reviewerName', 'rating', 'active', 'order'],
    description: 'Customer reviews displayed on the homepage carousel.',
  },
  fields: [
    {
      name: 'reviewerName',
      type: 'text',
      required: true,
      label: 'Reviewer Name',
    },
    {
      name: 'rating',
      type: 'number',
      required: true,
      min: 1,
      max: 5,
      defaultValue: 5,
      label: 'Star Rating (1–5)',
    },
    {
      name: 'reviewText',
      type: 'textarea',
      required: true,
      label: 'Review',
      admin: {
        description: 'Keep to 2–3 sentences for best display.',
      },
    },
    {
      name: 'timeLabel',
      type: 'text',
      label: 'Time Label',
      defaultValue: '1 week ago',
      admin: {
        description: 'Displayed as-is. E.g. "1 week ago", "1 month ago".',
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      label: 'Active (visible on website)',
    },
    {
      name: 'order',
      type: 'number',
      label: 'Display Order',
      admin: {
        description: 'Lower numbers appear first in the carousel.',
      },
    },
  ],
}

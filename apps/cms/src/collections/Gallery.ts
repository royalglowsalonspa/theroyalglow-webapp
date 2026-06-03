/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Gallery
 * Scope        : CMS Collections
 *
 * Description  : Payload CMS collection for gallery images displayed on
 *                the /gallery page with category filtering.
 *
 * Responsibilities :
 * - Define gallery schema (image, alt, caption, category, order)
 * - Provide world-readable access, admin-only writes
 *
 * Features / Functionality :
 * - Category-based filtering (Salon, Spa, Interior, Team, Work)
 * - Alt text required for accessibility
 * - Display ordering
 *
 * Tech Stack   : Payload CMS v3
 * Layer        : CMS (Collection)
 *
 * Dependencies : payload, ../access/published
 *
 * Notes        :
 * - Images stored in R2 via the Media collection relationship
 ************************************************************/
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

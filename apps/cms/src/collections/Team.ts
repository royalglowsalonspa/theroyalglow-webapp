/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Team
 * Scope        : CMS Collections
 *
 * Description  : Payload CMS collection for team member bios displayed
 *                on the /about page.
 *
 * Responsibilities :
 * - Define team member schema (name, role, bio, photo, specializations)
 * - Provide world-readable access, admin-only writes
 *
 * Features / Functionality :
 * - Name, role, bio, photo upload
 * - Specializations array for skill tags
 * - Display ordering
 *
 * Tech Stack   : Payload CMS v3
 * Layer        : CMS (Collection)
 *
 * Dependencies : payload, ../access/published
 *
 * Notes        :
 * - Referenced as author in Blog collection
 ************************************************************/
import type { CollectionConfig } from 'payload'
import { adminsWrite, anyoneReads } from '../access/published'
import { revalidateHooks } from '../hooks/revalidate'

/** Team member bios, optionally surfaced on `/about`. World-readable. */
export const Team: CollectionConfig = {
  slug: 'team',
  hooks: revalidateHooks('team'),
  access: {
    read: anyoneReads,
    create: adminsWrite,
    update: adminsWrite,
    delete: adminsWrite,
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'role', 'order'],
    group: 'People',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'role',
      type: 'text',
      required: true,
    },
    {
      name: 'bio',
      type: 'textarea',
    },
    {
      name: 'photo',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'specializations',
      type: 'array',
      fields: [
        {
          name: 'value',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      name: 'order',
      type: 'number',
    },
  ],
}

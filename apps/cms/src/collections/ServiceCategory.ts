/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 15-06-2026 & Updated - 15-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : ServiceCategory
 * Scope        : CMS Collections
 *
 * Description  : Payload CMS collection for BOOKABLE service categories
 *                (Salon / SPA). Payload is the authoritative write surface;
 *                every save is mirrored to Drizzle `public.service_category`
 *                — the table the booking engine reads — by the
 *                `syncServiceCategoryToPublic` afterChange hook.
 *
 * Responsibilities :
 * - Define the category schema mirroring Drizzle `public.service_category`
 * - Override Payload's default integer id with a nanoid `text` id
 * - Auto-generate `slug` from `name` on create
 * - Gate writes to authenticated Payload users; DISABLE delete entirely
 * - Compose the cross-schema sync hook with the cache-revalidation hooks
 *
 * Features / Functionality :
 * - Salon/SPA `serviceType` select mirroring the Drizzle `service_type` enum
 * - Unique `slug` enforced in Payload before the sync write can fail on it
 * - Display order + isActive toggle for retiring a category without deleting
 *
 * Tech Stack   : Payload CMS v3, Drizzle ORM, PostgreSQL (Neon)
 * Layer        : CMS (Collection)
 *
 * Dependencies : payload, nanoid, slugify, ../access/published,
 *                ../hooks/revalidate, ../hooks/sync-service-category
 *
 * Notes        :
 * - Collection slug is `service_category` (underscore, NOT kebab-case) so it
 *   matches the Drizzle table name `public.service_category` and the
 *   `relationTo: 'service_category'` target of `Service.categoryId`. Payload
 *   applies no format constraint to collection slugs, so this is valid.
 * - Distinct from `ServiceCard` (slug `service-card`), which is homepage
 *   marketing display data with no booking-engine relationship.
 ************************************************************/
import { nanoid } from 'nanoid'
import type { CollectionBeforeChangeHook, CollectionConfig, FieldHook } from 'payload'
import slugify from 'slugify'
import { adminsWrite, anyoneReads } from '../access/published'
import { revalidateHooks } from '../hooks/revalidate'
import { syncServiceCategoryToPublic } from '../hooks/sync-service-category'

/**
 * Cache-busting hooks. The tag is deliberately `'service'`, NOT
 * `'service_category'`: the web app's `/api/revalidate` route validates the
 * incoming tag against an ALLOWED_TAGS whitelist which contains `'service'`
 * but NOT `'service_category'`, so an unlisted tag is rejected with HTTP 400
 * and nothing is revalidated. The route then calls
 * `revalidatePath('/', 'layout')`, which refreshes every surface anyway — so
 * reusing the `'service'` tag is both correct and sufficient.
 *
 * DO NOT "fix" this to `'service_category'`; that silently breaks cache-busting
 * for category edits. If it must change, add the tag to ALLOWED_TAGS in
 * `apps/web/src/app/api/revalidate/route.ts` first.
 */
const revalidate = revalidateHooks('service')

/**
 * Generate the primary key on create.
 *
 * Payload's Postgres adapter auto-creates an integer/serial `id` column unless
 * a top-level field named `id` is explicitly declared. Drizzle's
 * `public.service.category_id` FK is `text` holding a plain `nanoid()`, so an
 * integer (or UUID) id here would put `cms.service_category.id` and
 * `public.service_category.id` in different ID-spaces and break referential
 * integrity on every service that references a category.
 *
 * `nanoid()` is used directly — NOT `customAlphabet(...)` — because `@rgss/db`
 * generates these ids with plain `nanoid()` (21 chars, default 64-char
 * url-safe alphabet). Calling the same function guarantees exact parity.
 */
const generateNanoId: FieldHook = ({ operation, value }) => {
  if (operation === 'create' && !value) {
    return nanoid()
  }

  return value
}

/** Auto-generate `slug` from `name` on create when the editor left it blank. */
const generateSlug: CollectionBeforeChangeHook = ({ data, operation }) => {
  if (operation === 'create' && !data.slug && typeof data.name === 'string') {
    data.slug = slugify(data.name, { lower: true, strict: true })
  }

  return data
}

export const ServiceCategory: CollectionConfig = {
  slug: 'service_category',
  labels: {
    singular: 'Service Category',
    plural: 'Service Categories',
  },
  access: {
    read: anyoneReads,
    create: adminsWrite,
    update: adminsWrite,
    // DELETE DISABLED — unlike the marketing collections (ServiceCard, gallery,
    // banners) which allow `delete: adminsWrite`, booking data is never hard
    // deleted. Two reasons:
    //   1. Repo convention: no soft-delete column, but also never hard-delete
    //      operational records (see .kiro/steering/database.md) — categories are
    //      retired with the `isActive` toggle so historical bookings and
    //      invoices keep resolving their service lineage.
    //   2. `public.service.category_id` carries an ON DELETE RESTRICT FK, so
    //      once any service references this category the delete would fail at
    //      the database anyway. Blocking it here turns a confusing 500 into no
    //      button at all.
    delete: () => false,
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'serviceType', 'isActive', 'displayOrder'],
    description:
      'Bookable service categories. Categories are DEACTIVATED (untick "Active"), never deleted — that is why there is no delete button. A category\'s Salon/SPA type governs which services can belong to it, and a booking may only contain services of one type.',
    // Same group as the Service collection so the two sit together in the sidebar.
    group: 'Services',
  },
  hooks: {
    // Compose, never replace. The sync hook runs FIRST (it writes
    // public.service_category on Payload's own transaction, so it must be able
    // to roll the whole save back), THEN the cache-busting ping fires.
    // Dropping either one is a regression: without sync the booking engine goes
    // stale, without revalidate the website cache does.
    afterChange: [syncServiceCategoryToPublic, ...revalidate.afterChange],
    afterDelete: revalidate.afterDelete,
    beforeChange: [generateSlug],
  },
  fields: [
    {
      // Custom id override — see `generateNanoId` above for why this exists.
      name: 'id',
      type: 'text',
      admin: { hidden: true },
      hooks: {
        beforeValidate: [generateNanoId],
      },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
      label: 'Category Name',
      admin: {
        description: 'E.g. "Hair Care", "Body Massage", "Bridal".',
      },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      // Mirrors the UNIQUE constraint on Drizzle `public.service_category.slug`
      // so Payload rejects a duplicate in the admin UI BEFORE the sync write
      // hits the database and fails the whole transaction.
      unique: true,
      admin: {
        description: 'URL-safe identifier. Generated from the name if left blank.',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description: 'Optional. Shown to customers alongside the category.',
      },
    },
    {
      name: 'serviceType',
      type: 'select',
      required: true,
      // Mirrors the Drizzle `service_type` enum ('salon' | 'spa') exactly —
      // these values are written straight through to public.service_category.
      options: [
        { label: 'Salon', value: 'salon' },
        { label: 'SPA', value: 'spa' },
      ],
      admin: {
        description: 'Governs which services belong here. A booking is Salon OR SPA, never mixed.',
      },
    },
    {
      name: 'displayOrder',
      type: 'number',
      defaultValue: 0,
      label: 'Display Order',
      admin: {
        description: 'Lower numbers appear first in the booking dialog and /services page.',
      },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      label: 'Active',
      admin: {
        description: 'Untick to retire this category. This replaces deletion.',
      },
    },
  ],
}

/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 08-06-2026 & Updated - 15-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : Service
 * Scope        : CMS Collections — Operational Booking Catalogue
 *
 * Description  : Payload CMS collection that OWNS the bookable service
 *                catalogue. This is no longer marketing/display data: every
 *                document written here is mirrored into the app's
 *                `public.service` table by the `syncServiceToPublic`
 *                afterChange hook, and the booking engine reads that table.
 *                Payload writes → Drizzle reads.
 *
 * Responsibilities :
 * - Mirror the Drizzle `public.service` shape field-for-field
 * - Override Payload's default integer id with a nanoid `text` id
 * - Constrain durationMinutes to the shared SERVICE_DURATION_MINUTES set
 * - Auto-generate `slug` from `name` on create
 * - Enforce the gems rule (gemsRedeemable ⇒ gemsRequired > 0)
 * - Sync to public.service, then bust the website cache
 *
 * Features / Functionality :
 * - Custom nanoid `id` (FK-compatible with booking_service/staff_service/
 *   offer_service/waitlist, all of which reference `public.service.id` as text)
 * - durationMinutes as a fixed `select`, options DERIVED from @rgss/types
 * - Delete DISABLED — services retire via the isActive toggle
 * - Composed hooks: sync first, cache revalidation second
 *
 * Tech Stack   : Payload CMS v3, TypeScript, nanoid, slugify
 * Layer        : CMS (Collection)
 *
 * Dependencies : payload, nanoid, slugify, @rgss/types,
 *                ../access/published, ../hooks/revalidate,
 *                ../hooks/sync-service
 *
 * Notes        :
 * - Collection slug stays `service` (repurposed in place, NOT a new
 *   collection). The previous marketing field set (`type`, `category`,
 *   `image`, `bookingRef`, `active`, `featured`, `order`) is replaced; it was
 *   dead code with no live reader.
 * - Payload's postgres adapter runs with `push: false`, so this shape only
 *   lands after `payload migrate:create` + `payload migrate`.
 ************************************************************/
import { SERVICE_DURATION_MINUTES } from '@rgss/types'
import { nanoid } from 'nanoid'
import type { CollectionBeforeValidateHook, CollectionConfig } from 'payload'
import { ValidationError } from 'payload'
import slugify from 'slugify'
import { adminsWrite, anyoneReads } from '../access/published'
import { revalidateHooks } from '../hooks/revalidate'
import { syncServiceToPublic } from '../hooks/sync-service'

// Existing cache-busting hooks for the `service` tag. Kept and COMPOSED with
// the sync hook below — never replaced. See the `hooks` block for why.
const revalidate = revalidateHooks('service')

/**
 * Enforce the gems rule: a gems-redeemable service must declare how many gems
 * it costs, and that count must be a positive integer.
 *
 * Implemented as a collection-level `beforeValidate` hook (rather than a
 * field-level `validate`) because the rule spans two fields. On `update`,
 * Payload passes only the CHANGED fields in `data`, so `originalDoc` is merged
 * underneath it — otherwise toggling an unrelated field on an already
 * gems-redeemable service would read `gemsRedeemable` as undefined and skip
 * the check.
 */
const validateGems: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  const merged = { ...(originalDoc ?? {}), ...(data ?? {}) } as {
    gemsRedeemable?: boolean | null
    gemsRequired?: number | null
  }

  if (merged.gemsRedeemable !== true) {
    return data
  }

  const gemsRequired = merged.gemsRequired
  const isPositiveInteger =
    typeof gemsRequired === 'number' && Number.isInteger(gemsRequired) && gemsRequired > 0

  if (!isPositiveInteger) {
    throw new ValidationError({
      collection: 'service',
      errors: [
        {
          message:
            'Gems Required must be a positive whole number when "Redeemable with Gems" is enabled.',
          path: 'gemsRequired',
        },
      ],
    })
  }

  return data
}

export const Service: CollectionConfig = {
  slug: 'service',
  access: {
    read: anyoneReads,
    create: adminsWrite,
    update: adminsWrite,
    // DELETE DISABLED — deliberately different from every other collection in
    // this CMS. Two reasons: (1) the repo convention is never to hard-delete
    // operational records, and (2) `booking_service.service_id` references
    // `public.service.id` with ON DELETE RESTRICT, so a CMS delete would either
    // fail the sync transaction or orphan booking history. Services are
    // retired with the `isActive` toggle instead.
    delete: () => false,
  },
  hooks: {
    // Sync FIRST (writes public.service on Payload's own transaction), THEN the
    // pre-existing cache-busting ping. Composing both is INTENTIONAL: dropping
    // `revalidateHooks` would mean CMS edits reach the database but the website
    // keeps serving a stale cached catalogue.
    afterChange: [syncServiceToPublic, ...revalidate.afterChange],
    afterDelete: revalidate.afterDelete,
    beforeValidate: [validateGems],
    beforeChange: [
      // Slug auto-generation. Runs before field validation (Payload order:
      // field beforeValidate → collection beforeValidate → collection
      // beforeChange → field validation), so `slug` is populated in time to
      // satisfy `required: true` on server-side writes and the seed script.
      ({ data, operation }) => {
        if (operation === 'create' && !data.slug && typeof data.name === 'string') {
          data.slug = slugify(data.name, { lower: true, strict: true })
        }
        return data
      },
    ],
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'categoryId', 'durationMinutes', 'pricePaise', 'isActive'],
    description:
      'Bookable services synced to the booking engine. Services are DEACTIVATED, never deleted — untick "Active" to retire one. There is intentionally no delete button, because past bookings and invoices reference these records.',
    group: 'Services',
  },
  fields: [
    {
      // CUSTOM ID OVERRIDE. Without a top-level field named `id`, Payload's
      // Postgres adapter auto-creates an integer/serial primary key. Drizzle's
      // foreign keys — booking_service.service_id, staff_service.service_id,
      // offer_service.service_id, waitlist.service_id — are all `text` nanoids
      // referencing public.service.id, so an integer id here would break
      // referential integrity the moment the sync hook writes a row.
      //
      // `nanoid()` is called directly (NOT customAlphabet) because @rgss/db's
      // schema uses plain `nanoid()` via `$defaultFn`. Reusing the same call
      // guarantees EXACT parity — 21 chars from nanoid's default 64-character
      // url-safe alphabet — with no chance of a hand-rolled alphabet drifting
      // from the library default.
      name: 'id',
      type: 'text',
      admin: { hidden: true },
      hooks: {
        beforeValidate: [
          ({ value, operation }) => {
            if (operation === 'create' && !value) {
              return nanoid()
            }
            return value
          },
        ],
      },
    },
    {
      name: 'categoryId',
      type: 'relationship',
      relationTo: 'service_category',
      hasMany: false,
      required: true,
      label: 'Category',
    },
    {
      name: 'name',
      type: 'text',
      required: true,
      label: 'Service Name',
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      // Mirrors the UNIQUE constraint on public.service.slug so Payload rejects
      // a duplicate in the admin UI BEFORE the sync write fails on the database
      // constraint (which would surface as an opaque 500).
      unique: true,
      label: 'Slug',
      admin: {
        description: 'Auto-generated from the service name on create. Override only if needed.',
      },
      // The default text validation would reject an empty slug client-side,
      // before the beforeChange hook above ever runs. This replacement accepts
      // an empty value on create when a `name` is present (the hook fills it),
      // and otherwise behaves like a required field.
      validate: (value: unknown, options: unknown) => {
        if (typeof value === 'string' && value.length > 0) {
          return true
        }
        const siblingData = (options as { siblingData?: { name?: unknown } } | undefined)
          ?.siblingData
        if (typeof siblingData?.name === 'string' && siblingData.name.trim().length > 0) {
          return true
        }
        return 'This field is required.'
      },
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Description',
    },
    {
      name: 'durationMinutes',
      type: 'select',
      required: true,
      label: 'Duration',
      // Options are DERIVED from the shared constant, never hard-coded — the
      // CMS dropdown, seed data, and validation all read one source of truth.
      options: SERVICE_DURATION_MINUTES.map((m) => ({
        label: `${m} minutes`,
        value: String(m),
      })),
      admin: {
        description:
          'Typical: beard/shave 15min, haircut 30min, advanced haircut / classic facial / spa mani-pedi 45min, most SPA 60-90min, global colour (long) & bridal makeup 120min, keratin 180min.',
      },
      // NOTE: Payload `select` values are STRINGS ('15', '30', ...). Drizzle's
      // public.service.duration_minutes is an integer column, so
      // mapPayloadToPublicService coerces the value with Number() before the
      // sync write.
    },
    {
      name: 'bufferMinutes',
      type: 'number',
      defaultValue: 0,
      label: 'Buffer (minutes)',
      admin: {
        description: 'Clean-up/turnaround time reserved after the service.',
      },
    },
    {
      name: 'pricePaise',
      type: 'number',
      required: true,
      min: 0,
      label: 'Price (paise)',
      admin: {
        description: 'GST-inclusive price in paise (e.g. 149900 = ₹1,499).',
      },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      label: 'Active (bookable)',
      admin: {
        description: 'Untick to retire a service. This replaces deletion.',
      },
    },
    {
      name: 'imageUrl',
      type: 'text',
      label: 'Image URL',
    },
    {
      name: 'displayOrder',
      type: 'number',
      defaultValue: 0,
      label: 'Display Order',
      admin: {
        description: 'Lower numbers appear first within the category.',
      },
    },
    {
      name: 'gemsRedeemable',
      type: 'checkbox',
      defaultValue: false,
      label: 'Redeemable with Gems',
    },
    {
      name: 'gemsRequired',
      type: 'number',
      label: 'Gems Required',
      admin: {
        description: 'Required when "Redeemable with Gems" is enabled. Must be greater than 0.',
      },
    },
    {
      name: 'gemsCatalogueOrder',
      type: 'number',
      label: 'Gems Catalogue Order',
      admin: {
        description: 'Position in the gems redemption catalogue.',
      },
    },
  ],
}

/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 15-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : seed-services
 * Scope        : CMS Operations Script — One-Time Catalogue Migration
 *
 * Description  : Seeds the Payload `service_category` and `service`
 *                collections FROM the live Drizzle tables
 *                `public.service_category` / `public.service`, so the CMS
 *                becomes the write surface for a catalogue that already exists.
 *                Ids and `createdAt`/`updatedAt` are carried across verbatim,
 *                keeping the `cms.*` and `public.*` ID-spaces aligned.
 *
 * Responsibilities :
 * - Read every category and service row from the `public` schema
 * - Pre-flight validate the live data BEFORE writing anything
 * - Create matching Payload documents (categories first, then services)
 * - Skip ids already present in `cms.*` so re-runs are idempotent
 * - Report created / skipped counts
 *
 * Usage :
 *   cd apps/cms
 *   # PowerShell
 *   $env:SERVICE_SYNC_ENABLED='false'
 *   bun run --env-file=.env.local scripts/seed-services.ts
 *
 *   # bash
 *   SERVICE_SYNC_ENABLED=false bun run --env-file=.env.local scripts/seed-services.ts
 *
 * Notes :
 * - MUST run with SERVICE_SYNC_ENABLED=false. This script reads FROM
 *   `public.service`, then calls `payload.create()` — with the sync hook live
 *   that fires `syncServiceToPublic`, which writes `public.service` using the
 *   SAME id it was just read from. The script REFUSES to run when the flag is
 *   enabled rather than relying on the hook's `onConflictDoUpdate` to absorb it.
 * - The upsert in the sync hook is NOT a guard against re-running the seed:
 *   Payload rejects a duplicate `id` in its own validation ("The following
 *   field is invalid: id") before `afterChange` ever runs. Idempotency comes
 *   from the `cms.*` id skip-set built below.
 * - Prerequisites: the Payload migration (Task 3.0) applied on the target
 *   branch, and DATABASE_URL pointing at that branch.
 * - Reads use `@rgss/db`'s neon-http client (a separate read-only connection).
 *   That is safe here: the seed is one-off and non-transactional, and Payload
 *   owns every write.
 * - The two pre-flight guards (`assertSyncDisabled`, `assertSeedable`) live in
 *   `./lib/seed-validation` so they can be asserted WITHOUT a database. They are
 *   pure and their messages are unchanged by that extraction.
 ************************************************************/
import config from '@payload-config'
import { db as drizzleDb } from '@rgss/db'
import { service, serviceCategory } from '@rgss/db/schema'
import { getPayload } from 'payload'
import { assertSeedable, assertSyncDisabled, type DurationOption } from './lib/seed-validation'

const main = async (): Promise<void> => {
  assertSyncDisabled()

  const payload = await getPayload({ config })

  // Read the live catalogue. Categories are ordered before services below
  // because service.categoryId is a Payload relationship that must resolve.
  const categories = await drizzleDb.select().from(serviceCategory)
  const services = await drizzleDb.select().from(service)

  console.log(
    `Read public.service_category = ${categories.length} rows, public.service = ${services.length} rows`,
  )

  assertSeedable(categories, services)

  // Idempotency: ids already in `cms.*` are skipped. A second `payload.create()`
  // for the same id fails Payload's own field validation before the sync hook
  // runs, so the skip-set (not the hook's upsert) is what makes re-runs safe.
  const [existingCategories, existingServices] = await Promise.all([
    payload.find({ collection: 'service_category', depth: 0, limit: 0, pagination: false }),
    payload.find({ collection: 'service', depth: 0, limit: 0, pagination: false }),
  ])
  const seededCategoryIds = new Set(existingCategories.docs.map((doc) => doc.id))
  const seededServiceIds = new Set(existingServices.docs.map((doc) => doc.id))

  let createdCategories = 0
  for (const cat of categories) {
    if (seededCategoryIds.has(cat.id)) {
      continue
    }

    await payload.create({
      collection: 'service_category',
      data: {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        serviceType: cat.serviceType,
        displayOrder: cat.displayOrder,
        isActive: cat.isActive,
        // Honoured by payload.create() — verified by the Task 5.0 spike on dev.
        createdAt: cat.createdAt.toISOString(),
        updatedAt: cat.updatedAt.toISOString(),
      },
    })
    createdCategories++
  }

  let createdServices = 0
  for (const svc of services) {
    if (seededServiceIds.has(svc.id)) {
      continue
    }

    await payload.create({
      collection: 'service',
      data: {
        id: svc.id,
        categoryId: svc.categoryId,
        name: svc.name,
        slug: svc.slug,
        description: svc.description,
        // Payload `select` values are STRINGS; the sync hook's mapper coerces
        // them back with Number(). Membership was proven by assertSeedable(),
        // so this narrowing cast cannot hide a bad value.
        durationMinutes: String(svc.durationMinutes) as DurationOption,
        bufferMinutes: svc.bufferMinutes,
        pricePaise: svc.pricePaise,
        isActive: svc.isActive,
        imageUrl: svc.imageUrl,
        displayOrder: svc.displayOrder,
        gemsRedeemable: svc.gemsRedeemable,
        gemsRequired: svc.gemsRequired,
        gemsCatalogueOrder: svc.gemsCatalogueOrder,
        createdAt: svc.createdAt.toISOString(),
        updatedAt: svc.updatedAt.toISOString(),
      },
    })
    createdServices++
  }

  console.log(
    [
      'Seed complete.',
      `  categories : ${createdCategories} created, ${categories.length - createdCategories} already present`,
      `  services   : ${createdServices} created, ${services.length - createdServices} already present`,
      '',
      'Next: restore SERVICE_SYNC_ENABLED (remove the override or set it to `true`)',
      'and restart the CMS so live edits sync to public.* again.',
    ].join('\n'),
  )

  process.exit(0)
}

await main()

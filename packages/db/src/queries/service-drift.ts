/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 29-07-2026 & Updated - 29-07-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : service-drift
 * Scope        : Data Access — Background Jobs
 *
 * Description  : Read-only snapshot reads for the daily service-catalogue drift
 *                reconciliation job. Loads `cms.service` / `cms.service_category`
 *                and `public.service` / `public.service_category` in a shape the
 *                pure diffing logic can compare field-for-field.
 *
 * Responsibilities :
 * - Read the CMS-side (Payload) catalogue rows, normalised to Drizzle's shape
 * - Read the public-side catalogue rows the booking engine consumes
 * - Return both snapshots without mutating anything
 *
 * Features / Functionality :
 * - getServiceDriftSnapshot() → { categories, services } snapshot pairs
 * - Payload column-name + type normalisation (see Notes)
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../index, ../schema/service
 *
 * Notes        :
 * - READ-ONLY. Requirement 17.5 makes the reconciliation job detect-and-alert,
 *   never auto-repair, so this module contains no writes.
 * - Four `cms.*` normalisations are load-bearing:
 *     1. the relationship column is `category_id_id` (Payload's `categoryId`
 *        field + the adapter's `_id` suffix), mapped to `categoryId`
 *     2. `duration_minutes` is the enum `cms.enum_service_duration_minutes`,
 *        which has NO direct cast to integer — it needs `::text::int`
 *     3. numeric columns (`price_paise`, `buffer_minutes`, `display_order`,
 *        `gems_*`) come back as strings over the wire, so they are cast `::int`
 *        to match Drizzle's `integer` columns. Money stays integer paise.
 *     4. `cms.*` timestamps are `timestamp(3)` while `public.*` keeps
 *        microseconds — the caller MUST compare them with a tolerance.
 * - Raw SQL is used for the `cms.*` side deliberately: adding `cms` tables to
 *   packages/db/src/schema would change the drizzle snapshot and trip the CI
 *   drift gate. Payload owns that schema and its own migrations.
 * - No transaction is opened and nothing is locked, so the job never blocks CMS
 *   writes (Requirement 17.6).
 ************************************************************/

import { asc, sql } from 'drizzle-orm'
import { db } from '../index'
import { service, serviceCategory } from '../schema/service'

// Snapshot reads for the drift-reconciliation job (Requirement 17). Both sides
// are shaped identically (camelCase keys, integers as numbers, timestamps as
// Date) so @rgss/business's pure differ can compare them without knowing which
// schema a row came from.

export type ServiceCategoryDriftRow = {
  id: string
  name: string | null
  slug: string | null
  description: string | null
  serviceType: string | null
  displayOrder: number | null
  isActive: boolean | null
  createdAt: Date | null
  updatedAt: Date | null
}

export type ServiceDriftRow = {
  id: string
  categoryId: string | null
  name: string | null
  slug: string | null
  description: string | null
  durationMinutes: number | null
  bufferMinutes: number | null
  pricePaise: number | null
  isActive: boolean | null
  imageUrl: string | null
  displayOrder: number | null
  gemsRedeemable: boolean | null
  gemsRequired: number | null
  gemsCatalogueOrder: number | null
  createdAt: Date | null
  updatedAt: Date | null
}

export type ServiceDriftSnapshot = {
  categories: {
    cmsRows: ServiceCategoryDriftRow[]
    publicRows: ServiceCategoryDriftRow[]
  }
  services: {
    cmsRows: ServiceDriftRow[]
    publicRows: ServiceDriftRow[]
  }
}

// Postgres hands back `numeric` as a string and `timestamptz` as a string over
// the Neon HTTP wire. These coercions keep the two snapshot sides type-identical
// so the differ compares like with like.
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isNaN(n) ? null : n
}

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) {
    return null
  }
  if (value instanceof Date) {
    return value
  }
  const d = new Date(value as string)
  return Number.isNaN(d.getTime()) ? null : d
}

function toText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function toBool(value: unknown): boolean | null {
  if (value === null || value === undefined) {
    return null
  }
  return value === true || value === 'true' || value === 't'
}

async function readCmsCategories(): Promise<ServiceCategoryDriftRow[]> {
  const result = await db.execute(sql`
    SELECT
      id,
      name,
      slug,
      description,
      service_type::text AS service_type,
      display_order::int AS display_order,
      is_active,
      created_at,
      updated_at
    FROM cms.service_category
    ORDER BY id ASC
  `)

  return (result.rows as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    name: toText(row.name),
    slug: toText(row.slug),
    description: toText(row.description),
    serviceType: toText(row.service_type),
    displayOrder: toNumber(row.display_order),
    isActive: toBool(row.is_active),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  }))
}

async function readCmsServices(): Promise<ServiceDriftRow[]> {
  // `duration_minutes` is an enum — `::text::int` is the ONLY valid path to the
  // integer Drizzle stores. A direct `::int` cast raises 42846.
  const result = await db.execute(sql`
    SELECT
      id,
      category_id_id AS category_id,
      name,
      slug,
      description,
      duration_minutes::text::int AS duration_minutes,
      buffer_minutes::int AS buffer_minutes,
      price_paise::int AS price_paise,
      is_active,
      image_url,
      display_order::int AS display_order,
      gems_redeemable,
      gems_required::int AS gems_required,
      gems_catalogue_order::int AS gems_catalogue_order,
      created_at,
      updated_at
    FROM cms.service
    ORDER BY id ASC
  `)

  return (result.rows as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    categoryId: toText(row.category_id),
    name: toText(row.name),
    slug: toText(row.slug),
    description: toText(row.description),
    durationMinutes: toNumber(row.duration_minutes),
    bufferMinutes: toNumber(row.buffer_minutes),
    pricePaise: toNumber(row.price_paise),
    isActive: toBool(row.is_active),
    imageUrl: toText(row.image_url),
    displayOrder: toNumber(row.display_order),
    gemsRedeemable: toBool(row.gems_redeemable),
    gemsRequired: toNumber(row.gems_required),
    gemsCatalogueOrder: toNumber(row.gems_catalogue_order),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  }))
}

async function readPublicCategories(): Promise<ServiceCategoryDriftRow[]> {
  const rows = await db
    .select({
      id: serviceCategory.id,
      name: serviceCategory.name,
      slug: serviceCategory.slug,
      description: serviceCategory.description,
      serviceType: serviceCategory.serviceType,
      displayOrder: serviceCategory.displayOrder,
      isActive: serviceCategory.isActive,
      createdAt: serviceCategory.createdAt,
      updatedAt: serviceCategory.updatedAt,
    })
    .from(serviceCategory)
    .orderBy(asc(serviceCategory.id))

  return rows.map((row) => ({ ...row, serviceType: String(row.serviceType) }))
}

async function readPublicServices(): Promise<ServiceDriftRow[]> {
  return db
    .select({
      id: service.id,
      categoryId: service.categoryId,
      name: service.name,
      slug: service.slug,
      description: service.description,
      durationMinutes: service.durationMinutes,
      bufferMinutes: service.bufferMinutes,
      pricePaise: service.pricePaise,
      isActive: service.isActive,
      imageUrl: service.imageUrl,
      displayOrder: service.displayOrder,
      gemsRedeemable: service.gemsRedeemable,
      gemsRequired: service.gemsRequired,
      gemsCatalogueOrder: service.gemsCatalogueOrder,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
    })
    .from(service)
    .orderBy(asc(service.id))
}

/**
 * Read both catalogue snapshots for the reconciliation job.
 *
 * Read-only, no transaction, four independent SELECTs. Categories are returned
 * alongside services so one job run covers both table pairs.
 */
export async function getServiceDriftSnapshot(): Promise<ServiceDriftSnapshot> {
  const [cmsCategories, publicCategories, cmsServices, publicServices] = await Promise.all([
    readCmsCategories(),
    readPublicCategories(),
    readCmsServices(),
    readPublicServices(),
  ])

  return {
    categories: { cmsRows: cmsCategories, publicRows: publicCategories },
    services: { cmsRows: cmsServices, publicRows: publicServices },
  }
}

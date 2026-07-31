/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : services
 * Scope        : Data Access — Services
 *
 * Description  : Query functions for the service catalogue including grouped
 *                category/service listings and individual service lookups.
 *
 * Responsibilities :
 * - Fetch all active categories with their active services (grouped)
 * - Fetch a single service by slug for detail pages
 *
 * Features / Functionality :
 * - Categories and services filtered by isActive flag
 * - Ordered by displayOrder for consistent UI rendering
 * - Services nested under their parent category
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../index, ../schema/service
 *
 * Notes        : This data is cached in Upstash Redis with a 5-minute TTL
 *                for fast service catalog responses.
 ************************************************************/

import type {
  ServiceCategoryCreateInput,
  ServiceCategoryUpdateInput,
  ServiceCreateInput,
  ServiceUpdateInput,
} from '@rgss/types'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../index'
import { service, serviceCategory } from '../schema/service'

// Get all active categories with their active services, grouped
export async function getAllServicesGrouped() {
  const categories = await db
    .select()
    .from(serviceCategory)
    .where(eq(serviceCategory.isActive, true))
    .orderBy(asc(serviceCategory.displayOrder))

  const services = await db
    .select()
    .from(service)
    .where(eq(service.isActive, true))
    .orderBy(asc(service.displayOrder))

  return categories.map((cat) => ({
    ...cat,
    services: services.filter((s) => s.categoryId === cat.id),
  }))
}

// Active catalogue: active categories ordered by displayOrder, each carrying its
// active services (ordered by displayOrder) with the full read projection used by
// the booking/services surfaces. Services are joined to their category so each
// row carries the category name. Pure read — no side effects (KV-cacheable).
export async function getActiveCatalogue() {
  const categories = await db
    .select({
      id: serviceCategory.id,
      name: serviceCategory.name,
      serviceType: serviceCategory.serviceType,
      displayOrder: serviceCategory.displayOrder,
    })
    .from(serviceCategory)
    .where(eq(serviceCategory.isActive, true))
    .orderBy(asc(serviceCategory.displayOrder))

  const services = await db
    .select({
      id: service.id,
      categoryId: service.categoryId,
      categoryName: serviceCategory.name,
      serviceType: serviceCategory.serviceType,
      name: service.name,
      slug: service.slug,
      durationMinutes: service.durationMinutes,
      pricePaise: service.pricePaise,
      gemsRedeemable: service.gemsRedeemable,
      gemsRequired: service.gemsRequired,
    })
    .from(service)
    .innerJoin(serviceCategory, eq(service.categoryId, serviceCategory.id))
    .where(and(eq(service.isActive, true), eq(serviceCategory.isActive, true)))
    .orderBy(asc(service.displayOrder))

  return categories.map((cat) => ({
    ...cat,
    services: services.filter((s) => s.categoryId === cat.id),
  }))
}

// Fetch services by an array of ids (empty input → empty result). Includes the
// owning category's service_type since booking callers validate salon/spa
// against it, plus isActive so inactive services can be rejected, and the full
// read projection (category name, price paise, duration, gem fields).
export async function getServicesByIds(ids: string[]) {
  if (ids.length === 0) {
    return []
  }
  return db
    .select({
      id: service.id,
      categoryId: service.categoryId,
      categoryName: serviceCategory.name,
      serviceType: serviceCategory.serviceType,
      name: service.name,
      slug: service.slug,
      durationMinutes: service.durationMinutes,
      pricePaise: service.pricePaise,
      isActive: service.isActive,
      gemsRedeemable: service.gemsRedeemable,
      gemsRequired: service.gemsRequired,
    })
    .from(service)
    .innerJoin(serviceCategory, eq(service.categoryId, serviceCategory.id))
    .where(inArray(service.id, ids))
}

// Fetch a single active service by slug with its category name and the full read
// projection (duration, price paise, gem-redemption fields). Returns null when no
// active service matches the slug (unknown or inactive → caller maps to 404).
export async function getServiceBySlug(slug: string) {
  const rows = await db
    .select({
      id: service.id,
      categoryId: service.categoryId,
      categoryName: serviceCategory.name,
      serviceType: serviceCategory.serviceType,
      name: service.name,
      slug: service.slug,
      description: service.description,
      durationMinutes: service.durationMinutes,
      pricePaise: service.pricePaise,
      gemsRedeemable: service.gemsRedeemable,
      gemsRequired: service.gemsRequired,
    })
    .from(service)
    .innerJoin(serviceCategory, eq(service.categoryId, serviceCategory.id))
    .where(and(eq(service.slug, slug), eq(service.isActive, true)))
    .limit(1)
  return rows[0] ?? null
}

/* ------------------------------------------------------------------------- *
 * Admin management (services + categories) — single source of truth.         *
 * Includes inactive rows; ordered for the management UI.                     *
 * ------------------------------------------------------------------------- */

// Derive a url-safe slug from a name (lowercase, non-alphanumerics → hyphens).
function slugifyName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'item'
}

// All categories (incl. inactive), display order.
export async function getServiceCategoriesAll() {
  return db.select().from(serviceCategory).orderBy(asc(serviceCategory.displayOrder))
}

// All services (incl. inactive) joined to their category name/type, ordered by
// category then service display order — the admin management list.
export async function getServicesForAdmin() {
  return db
    .select({
      id: service.id,
      categoryId: service.categoryId,
      categoryName: serviceCategory.name,
      serviceType: serviceCategory.serviceType,
      name: service.name,
      slug: service.slug,
      description: service.description,
      durationMinutes: service.durationMinutes,
      bufferMinutes: service.bufferMinutes,
      pricePaise: service.pricePaise,
      isActive: service.isActive,
      displayOrder: service.displayOrder,
      gemsRedeemable: service.gemsRedeemable,
      gemsRequired: service.gemsRequired,
    })
    .from(service)
    .innerJoin(serviceCategory, eq(service.categoryId, serviceCategory.id))
    .orderBy(asc(serviceCategory.displayOrder), asc(service.displayOrder), asc(service.name))
}

export async function getServiceById(id: string) {
  const rows = await db.select().from(service).where(eq(service.id, id)).limit(1)
  return rows[0] ?? null
}

// Slug uniqueness for the `service` table.
async function uniqueServiceSlug(name: string): Promise<string> {
  const base = slugifyName(name)
  const existing = await db
    .select({ slug: service.slug })
    .from(service)
    .where(eq(service.slug, base))
    .limit(1)
  return existing.length === 0 ? base : `${base}-${nanoid(4).toLowerCase()}`
}

// Slug uniqueness for the `service_category` table.
async function uniqueCategorySlug(name: string): Promise<string> {
  const base = slugifyName(name)
  const existing = await db
    .select({ slug: serviceCategory.slug })
    .from(serviceCategory)
    .where(eq(serviceCategory.slug, base))
    .limit(1)
  return existing.length === 0 ? base : `${base}-${nanoid(4).toLowerCase()}`
}

// Create a service (slug auto-derived + de-duplicated).
export async function createService(data: ServiceCreateInput) {
  const slug = await uniqueServiceSlug(data.name)
  const [created] = await db
    .insert(service)
    .values({
      categoryId: data.categoryId,
      name: data.name,
      slug,
      description: data.description ?? null,
      durationMinutes: data.durationMinutes,
      bufferMinutes: data.bufferMinutes ?? 0,
      pricePaise: data.pricePaise,
      isActive: data.isActive ?? true,
      displayOrder: data.displayOrder ?? 0,
      gemsRedeemable: data.gemsRedeemable ?? false,
      gemsRequired: data.gemsRequired ?? null,
    })
    .returning()
  return created
}

// Patch a service. Only provided keys are written; `updatedAt` auto-bumps.
export async function updateService(id: string, patch: ServiceUpdateInput) {
  const values: Partial<typeof service.$inferInsert> = {}
  if (patch.categoryId !== undefined) {
    values.categoryId = patch.categoryId
  }
  if (patch.name !== undefined) {
    values.name = patch.name
  }
  if (patch.description !== undefined) {
    values.description = patch.description ?? null
  }
  if (patch.durationMinutes !== undefined) {
    values.durationMinutes = patch.durationMinutes
  }
  if (patch.bufferMinutes !== undefined) {
    values.bufferMinutes = patch.bufferMinutes
  }
  if (patch.pricePaise !== undefined) {
    values.pricePaise = patch.pricePaise
  }
  if (patch.isActive !== undefined) {
    values.isActive = patch.isActive
  }
  if (patch.displayOrder !== undefined) {
    values.displayOrder = patch.displayOrder
  }
  if (patch.gemsRedeemable !== undefined) {
    values.gemsRedeemable = patch.gemsRedeemable
  }
  if (patch.gemsRequired !== undefined) {
    values.gemsRequired = patch.gemsRequired ?? null
  }

  if (Object.keys(values).length === 0) {
    return getServiceById(id)
  }
  const [updated] = await db.update(service).set(values).where(eq(service.id, id)).returning()
  return updated ?? null
}

export async function getServiceCategoryById(id: string) {
  const rows = await db.select().from(serviceCategory).where(eq(serviceCategory.id, id)).limit(1)
  return rows[0] ?? null
}

// Create a category (slug auto-derived + de-duplicated).
export async function createServiceCategory(data: ServiceCategoryCreateInput) {
  const slug = await uniqueCategorySlug(data.name)
  const [created] = await db
    .insert(serviceCategory)
    .values({
      name: data.name,
      slug,
      serviceType: data.serviceType,
      description: data.description ?? null,
      displayOrder: data.displayOrder ?? 0,
      isActive: data.isActive ?? true,
    })
    .returning()
  return created
}

export async function updateServiceCategory(id: string, patch: ServiceCategoryUpdateInput) {
  const values: Partial<typeof serviceCategory.$inferInsert> = {}
  if (patch.name !== undefined) {
    values.name = patch.name
  }
  if (patch.serviceType !== undefined) {
    values.serviceType = patch.serviceType
  }
  if (patch.description !== undefined) {
    values.description = patch.description ?? null
  }
  if (patch.displayOrder !== undefined) {
    values.displayOrder = patch.displayOrder
  }
  if (patch.isActive !== undefined) {
    values.isActive = patch.isActive
  }

  if (Object.keys(values).length === 0) {
    return getServiceCategoryById(id)
  }
  const [updated] = await db
    .update(serviceCategory)
    .set(values)
    .where(eq(serviceCategory.id, id))
    .returning()
  return updated ?? null
}

// Number of services under a category (guards category UX/deletion).
export async function categoryServiceCount(categoryId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(service)
    .where(eq(service.categoryId, categoryId))
  return rows[0]?.count ?? 0
}

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
 * Notes        : This data is cached in Cloudflare KV with 5-minute TTL
 *                for edge-fast service catalog responses.
 ************************************************************/

import { asc, eq } from 'drizzle-orm'
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

export async function getServiceBySlug(slug: string) {
  const rows = await db.select().from(service).where(eq(service.slug, slug)).limit(1)
  return rows[0] ?? null
}

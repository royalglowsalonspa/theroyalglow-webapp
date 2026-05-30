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

/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : catalogue
 * Scope        : Customer Pages — services data (server)
 *
 * Description  : Reads the operational service catalogue from the app DB (the
 *                single source of truth managed in the admin portal) and maps it
 *                into the Service view-model the /services page renders. Replaces
 *                the previous Payload-backed services read so admin edits show on
 *                the website directly — no second source, no drift.
 *
 * Responsibilities :
 * - Fetch active categories + services via @rgss/db (getAllServicesGrouped)
 * - Map to the Service view-model (type from category, price via formatINR)
 * - Stay total: return [] on any failure so the page falls back gracefully
 *
 * Tech Stack   : TypeScript, Drizzle (via @rgss/db), @rgss/business
 * Layer        : Data Access seam (server-only)
 *
 * Dependencies : @rgss/db/queries, @rgss/business, @/lib/cms/types
 *
 * Notes        : Server-only. bookingRef carries the service slug so "Book This"
 *                deep-links the right service. Image may be empty (card handles it).
 ************************************************************/

import 'server-only'
import { formatINR } from '@rgss/business'
import { getAllServicesGrouped } from '@rgss/db/queries'
import type { Service } from '@/lib/cms/types'

/**
 * Active catalogue as Service view-models, salon + spa together (the page's
 * toggle filters by `type`). Returns [] on any error so /services falls back to
 * its static content rather than throwing.
 */
export async function getCatalogueServices(): Promise<Service[]> {
  try {
    const grouped = await getAllServicesGrouped()
    const services: Service[] = []
    for (const category of grouped) {
      for (const svc of category.services) {
        services.push({
          id: svc.id,
          name: svc.name,
          type: category.serviceType,
          category: category.name,
          image: { url: svc.imageUrl ?? '', alt: svc.name, width: null, height: null },
          description: svc.description ?? '',
          durationMinutes: svc.durationMinutes,
          priceFormatted: formatINR(svc.pricePaise),
          bookingRef: svc.slug,
        })
      }
    }
    return services
  } catch {
    return []
  }
}

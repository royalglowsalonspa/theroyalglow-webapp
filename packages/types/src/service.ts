/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 30-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : service (types)
 * Scope        : Shared Types & Validation
 *
 * Description  : Zod schemas + types for admin Service & Category management —
 *                the operational catalogue that drives bookings AND the customer
 *                /services page (single source of truth).
 *
 * Responsibilities :
 * - Validate category create/update (salon|spa, name, order, active)
 * - Validate service create/update (duration, buffer, price paise, gems, active)
 * - Own SERVICE_DURATION_MINUTES — the single source of truth for allowed
 *   service durations (CMS select options, validation, seed data)
 * - Encode the legacy slot-length rule: SPA services are fixed to 30 or 60 minutes
 *
 * Features / Functionality :
 * - serviceCategoryCreateSchema / serviceCategoryUpdateSchema
 * - serviceCreateSchema / serviceUpdateSchema
 * - SERVICE_DURATION_MINUTES + ServiceDurationMinutes (canonical duration set)
 * - SPA_DURATIONS + isValidDurationForType helper (legacy admin API guard)
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        : Money is paise (integer). Slugs are generated server-side.
 ************************************************************/
import { z } from 'zod'

// Mirrors serviceTypeEnum in packages/db/src/schema/enums.ts.
export const SERVICE_TYPES = ['salon', 'spa'] as const
export type ServiceTypeValue = (typeof SERVICE_TYPES)[number]

/**
 * Canonical set of allowed service durations, in minutes. SINGLE SOURCE OF TRUTH.
 *
 * Supersedes `SPA_DURATIONS` / `isValidDurationForType()` for the CMS write path:
 * a fixed option set makes the old SPA-vs-Salon conditional rule unnecessary by
 * construction. Payload's `durationMinutes` select options are DERIVED from this
 * array (mapped to `{ label, value }` pairs) and are NEVER hard-coded, so the CMS
 * UI, validation, and seed data cannot drift apart.
 *
 * Values are data-driven, from an audit of the real 57-service catalogue
 * (`packages/db/scripts/data/services-salon.ts` + `services-spa.ts`): 8 services
 * are 45min, 3 are 120min, and 1 is 180min (keratin). A 15/30/60/90-only set
 * would fail seed validation on all 12. `150` is headroom.
 */
export const SERVICE_DURATION_MINUTES = [15, 30, 45, 60, 90, 120, 150, 180] as const
export type ServiceDurationMinutes = (typeof SERVICE_DURATION_MINUTES)[number]

// LEGACY (admin API guard only — superseded by SERVICE_DURATION_MINUTES above).
// SPA services use fixed slot lengths; Salon services are free-form (5-min steps).
export const SPA_DURATIONS = [30, 60] as const

/**
 * Slot-length rule. SPA → exactly 30 or 60 minutes. Salon → any positive
 * duration in 5-minute steps (≤ 10h). Enforced in the API once the service's
 * category type is known.
 */
export function isValidDurationForType(type: ServiceTypeValue, minutes: number): boolean {
  if (type === 'spa') {
    return (SPA_DURATIONS as readonly number[]).includes(minutes)
  }
  return minutes >= 5 && minutes <= 600 && minutes % 5 === 0
}

// ── Category ──────────────────────────────────────────────────────────────
export const serviceCategoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  serviceType: z.enum(SERVICE_TYPES),
  description: z.string().trim().max(500).optional(),
  displayOrder: z.coerce.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
})
export type ServiceCategoryCreateInput = z.infer<typeof serviceCategoryCreateSchema>

export const serviceCategoryUpdateSchema = serviceCategoryCreateSchema.partial()
export type ServiceCategoryUpdateInput = z.infer<typeof serviceCategoryUpdateSchema>

// ── Service ───────────────────────────────────────────────────────────────
export const serviceCreateSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  durationMinutes: z.coerce.number().int().min(5).max(600),
  bufferMinutes: z.coerce.number().int().min(0).max(120).optional(),
  pricePaise: z.coerce.number().int().min(0).max(100_000_000),
  isActive: z.boolean().optional(),
  displayOrder: z.coerce.number().int().min(0).max(9999).optional(),
  gemsRedeemable: z.boolean().optional(),
  gemsRequired: z.coerce.number().int().min(0).max(1_000_000).nullable().optional(),
})
export type ServiceCreateInput = z.infer<typeof serviceCreateSchema>

export const serviceUpdateSchema = serviceCreateSchema.partial()
export type ServiceUpdateInput = z.infer<typeof serviceUpdateSchema>

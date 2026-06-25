/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 21-06-2026 & Updated - 21-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : waitlist (types)
 * Scope        : Shared Types & Validation
 *
 * Description  : Zod schemas + types for the admin Waitlist module — the
 *                paginated, status-filterable waitlist queue and its status
 *                transition payload.
 *
 * Responsibilities :
 * - Define the waitlist-status literal union (mirror DB enum)
 * - Validate the waitlist list query (optional status filter + paging)
 * - Validate the status-transition payload for PATCH
 *
 * Features / Functionality :
 * - waitlistListQuerySchema — status?, page, pageSize (coerced)
 * - waitlistStatusUpdateSchema — { status }
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        : Mirrors packages/db/src/schema/enums.ts waitlistStatusEnum
 *                exactly. Entries are status-transitioned, never hard-deleted.
 ************************************************************/
import { z } from 'zod'

// Mirror packages/db/src/schema/enums.ts waitlistStatusEnum exactly.
export const WAITLIST_STATUSES = ['waiting', 'notified', 'booked', 'expired', 'cancelled'] as const
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number]

// Paginated waitlist queue with an optional status filter. Numbers are coerced
// (they arrive as query strings).
export const waitlistListQuerySchema = z.object({
  status: z.enum(WAITLIST_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})
export type WaitlistListQuery = z.infer<typeof waitlistListQuerySchema>

// Status-transition payload for PATCH /api/waitlist/[id]. The legality of the
// requested move is enforced by the state-machine guard in the route layer.
export const waitlistStatusUpdateSchema = z.object({
  status: z.enum(WAITLIST_STATUSES),
})
export type WaitlistStatusUpdateInput = z.infer<typeof waitlistStatusUpdateSchema>

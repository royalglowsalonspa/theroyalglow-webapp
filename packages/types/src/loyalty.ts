/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : loyalty (types)
 * Scope        : Shared Types & Validation
 *
 * Description  : Zod schemas for customer-facing gems (loyalty)
 *                redemption operations.
 *
 * Responsibilities :
 * - Validate online gems redemption input (service, branch, slot)
 * - Enforce a client-supplied idempotency key for double-submit
 *   protection
 *
 * Features / Functionality :
 * - redeemGemsSchema — serviceId, branchId, date, slot, idempotencyKey
 *
 * Tech Stack   : TypeScript, Zod
 * Layer        : Shared Package
 *
 * Dependencies : zod
 *
 * Notes        :
 * - Redemption is all-or-nothing; the schema NEVER accepts a
 *   client-supplied gems amount — the server reads gemsRequired
 *   from live catalogue data at execution time.
 ************************************************************/
import { z } from 'zod'

// POST /api/gems/redeem body. Mirrors createBookingSchema's date/time formats.
// Deliberately omits any gems amount: the charged cost is the server-read
// `gemsRequired`, never a client value.
export const redeemGemsSchema = z.object({
  serviceId: z.string().min(1),
  branchId: z.string().min(1),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  // Client-supplied idempotency key (e.g. crypto.randomUUID()). De-dupes
  // double-clicks / retries. Bounded length; opaque to the server.
  idempotencyKey: z.string().min(8).max(64),
})
export type RedeemGemsInput = z.infer<typeof redeemGemsSchema>

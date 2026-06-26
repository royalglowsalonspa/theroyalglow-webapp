/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : redemptions
 * Scope        : Data Access — Gems Redemption
 *
 * Description  : Query functions for online gems redemption. Provides a live
 *                re-read of a single redeemable service and the guarded, atomic,
 *                idempotent write that spends gems to create a ₹0 booking.
 *
 * Responsibilities :
 * - Re-read a single service joined to its category for execution-time
 *   re-validation (serviceType, gem fields, isActive)
 * - Execute the single guarded data-modifying CTE that deducts gems and creates
 *   the booking + booking_service + redeemed loyalty_transaction atomically
 * - Treat a 0-row guard result as insufficient balance (nothing persisted)
 * - Resolve a duplicate redemption_key (idempotency replay) to the existing booking
 *
 * Features / Functionality :
 * - Single CTE statement = single implicit transaction (all-or-nothing)
 * - Guarded UPDATE … WHERE gems_balance >= req gates every downstream INSERT
 * - Race-safe / double-spend-safe via the row-level lock on the balance UPDATE
 * - Idempotent via the booking_redemption_key_uidx partial unique index
 *
 * Tech Stack   : TypeScript, Drizzle ORM, Neon PostgreSQL
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, nanoid, @rgss/errors, ../index, ../schema/booking,
 *                ../schema/service
 *
 * Notes        : This is the one justified raw `sql` statement — Drizzle's query
 *                builder / db.batch() cannot express a conditional multi-table
 *                atomic write on neon-http (no interactive transactions). It uses
 *                bound parameters only, never string concatenation.
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { eq, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../index'
import { booking } from '../schema/booking'
import { service, serviceCategory } from '../schema/service'

// Live re-read of a single service joined to its category for the serviceType
// (salon/spa), including the gem fields + isActive used for execution-time
// re-validation (Req 7). Returns null when the service does not exist.
export async function getRedeemableServiceById(serviceId: string): Promise<{
  id: string
  name: string
  serviceType: 'salon' | 'spa'
  durationMinutes: number
  pricePaise: number
  isActive: boolean
  gemsRedeemable: boolean
  gemsRequired: number | null
} | null> {
  const rows = await db
    .select({
      id: service.id,
      name: service.name,
      serviceType: serviceCategory.serviceType,
      durationMinutes: service.durationMinutes,
      pricePaise: service.pricePaise,
      isActive: service.isActive,
      gemsRedeemable: service.gemsRedeemable,
      gemsRequired: service.gemsRequired,
    })
    .from(service)
    .innerJoin(serviceCategory, eq(service.categoryId, serviceCategory.id))
    .where(eq(service.id, serviceId))
    .limit(1)

  return rows[0] ?? null
}

export type RedeemServiceWithGemsInput = {
  accountId: string
  customerId: string
  branchId: string
  bookingNumber: string
  serviceType: 'salon' | 'spa'
  bookingDate: Date
  startTime: string
  endTime: string
  durationMinutes: number
  gemsRequired: number // server-side amount (Req 7.3)
  serviceId: string
  serviceName: string // snapshot
  staffId: string
  idempotencyKey: string
  description: string
}

export type RedeemServiceWithGemsResult =
  | { bookingId: string; bookingNumber: string; gemsSpent: number; newBalance: number }
  | { duplicate: true; bookingId: string; bookingNumber: string }

// The guarded atomic write. A single data-modifying-CTE statement:
//   guard               — UPDATE loyalty_account … WHERE gems_balance >= req (the guard)
//   new_booking         — INSERT booking            … SELECT … FROM guard
//   new_booking_service — INSERT booking_service    … SELECT … FROM new_booking
//   new_tx              — INSERT loyalty_transaction… SELECT … FROM new_booking
// terminating in a SELECT that projects the new balance + booking id/number.
//
// Postgres runs data-modifying CTEs exactly once and always to completion, so the
// two unreferenced INSERT CTEs (new_booking_service, new_tx) still execute. When
// the guard matches 0 rows, every downstream SELECT … FROM guard/new_booking
// yields 0 rows → nothing persists and the final SELECT returns 0 rows.
//
// 0 rows           → throw GEMS_INSUFFICIENT_BALANCE (nothing persisted).
// unique violation → idempotency replay: return the already-created booking.
export async function redeemServiceWithGems(
  input: RedeemServiceWithGemsInput,
): Promise<RedeemServiceWithGemsResult> {
  // Pre-generate all ids so child rows can reference them within the one statement.
  const bookingId = nanoid()
  const bookingServiceId = nanoid()
  const txId = nanoid()

  // `date` column wants YYYY-MM-DD; mirror the bookings.ts reschedule convention.
  const bookingDateStr = input.bookingDate.toISOString().slice(0, 10)

  let rows: Array<{ booking_id: string; booking_number: string; new_balance: number }>

  try {
    const result = await db.execute<{
      booking_id: string
      booking_number: string
      new_balance: number
    }>(sql`
      WITH guard AS (
        UPDATE loyalty_account
           SET gems_balance        = gems_balance - ${input.gemsRequired},
               total_gems_redeemed = total_gems_redeemed + ${input.gemsRequired},
               updated_at          = now()
         WHERE id = ${input.accountId}
           AND gems_balance >= ${input.gemsRequired}
        RETURNING id AS account_id, gems_balance AS new_balance
      ),
      new_booking AS (
        INSERT INTO booking
          (id, booking_number, branch_id, customer_id, status, service_type,
           booking_date, start_time, end_time, total_amount_paise,
           total_duration_minutes, is_walkin, is_membership_session, offer_id,
           is_gems_redemption, gems_redeemed, redemption_key)
        SELECT ${bookingId}, ${input.bookingNumber}, ${input.branchId}, ${input.customerId},
               'pending'::booking_status, ${input.serviceType}::service_type,
               ${bookingDateStr}::date, ${input.startTime}::time, ${input.endTime}::time, 0,
               ${input.durationMinutes}, false, false, NULL,
               true, ${input.gemsRequired}, ${input.idempotencyKey}
        FROM guard
        RETURNING id AS booking_id, booking_number
      ),
      new_booking_service AS (
        INSERT INTO booking_service
          (id, booking_id, service_id, staff_id, service_name_snapshot,
           price_at_booking_paise, duration_minutes, display_order)
        SELECT ${bookingServiceId}, nb.booking_id, ${input.serviceId}, ${input.staffId},
               ${input.serviceName}, 0, ${input.durationMinutes}, 0
        FROM new_booking nb
        RETURNING id
      ),
      new_tx AS (
        INSERT INTO loyalty_transaction
          (id, loyalty_account_id, type, gems_amount, booking_id, description)
        SELECT ${txId}, ${input.accountId}, 'redeemed'::loyalty_tx_type, ${input.gemsRequired},
               nb.booking_id, ${input.description}
        FROM new_booking nb
        RETURNING id
      )
      SELECT nb.booking_id AS booking_id,
             nb.booking_number AS booking_number,
             g.new_balance AS new_balance
      FROM new_booking nb, guard g
    `)
    rows = result.rows
  } catch (error) {
    // Idempotency replay: a retried submission with the same redemption_key hits
    // the partial unique index. The whole statement rolls back (no second
    // deduction); resolve to the booking the first attempt created.
    if (isRedemptionKeyConflict(error)) {
      const existing = await db
        .select({ id: booking.id, bookingNumber: booking.bookingNumber })
        .from(booking)
        .where(eq(booking.redemptionKey, input.idempotencyKey))
        .limit(1)
      const found = existing[0]
      if (found) {
        return { duplicate: true, bookingId: found.id, bookingNumber: found.bookingNumber }
      }
    }
    throw error
  }

  const row = rows[0]
  if (!row) {
    // Guard matched 0 rows: balance was insufficient at execution time. Nothing
    // persisted (the CTE gating guarantees it).
    throw new AppError({
      code: ERROR_CODES.GEMS_INSUFFICIENT_BALANCE,
      message: 'You do not have enough gems to redeem this service.',
      statusCode: 409,
    })
  }

  return {
    bookingId: row.booking_id,
    bookingNumber: row.booking_number,
    gemsSpent: input.gemsRequired,
    newBalance: row.new_balance,
  }
}

// Narrow an unknown driver error to a unique-constraint violation (Postgres
// SQLSTATE 23505) on the redemption_key partial unique index. Neon surfaces the
// SQLSTATE on `.code` and (when available) the constraint name on `.constraint`;
// fall back to a message match so the replay path never leaks a 500.
function isRedemptionKeyConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  const e = error as { code?: unknown; constraint?: unknown; message?: unknown }
  if (e.code !== '23505') {
    return false
  }
  const target = 'booking_redemption_key_uidx'
  if (typeof e.constraint === 'string') {
    return e.constraint === target
  }
  return typeof e.message === 'string' && e.message.includes(target)
}

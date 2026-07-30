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
 * - Resolve a known redemption_key to its existing booking BEFORE the guarded
 *   write, so an idempotency replay is never gated behind the balance guard
 * - Execute the single guarded data-modifying CTE that deducts gems and creates
 *   the booking + booking_service + redeemed loyalty_transaction atomically
 * - Treat a 0-row guard result as insufficient balance (nothing persisted)
 * - Resolve a duplicate redemption_key (idempotency replay) to the existing booking
 * - Expose that customer-scoped replay lookup (`findBookingByRedemptionKey`) so
 *   the route can short-circuit a retry BEFORE its own balance gate
 *
 * Features / Functionality :
 * - Single CTE statement = single implicit transaction (all-or-nothing)
 * - Guarded UPDATE … WHERE gems_balance >= req gates every downstream INSERT
 * - Race-safe / double-spend-safe via the row-level lock on the balance UPDATE
 * - Idempotent via a pre-write redemption_key lookup, with the
 *   booking_redemption_key_uidx partial unique index as the ultimate arbiter
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
import { and, eq, sql } from 'drizzle-orm'
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
//
// Idempotency is resolved in TWO places, deliberately:
//
//   1. A pre-write lookup of the redemption_key (below). The balance guard must
//      NOT gate the replay path: a customer who spends their whole balance and
//      then retries (network blip, double tap) has a balance that no longer
//      satisfies `gems_balance >= required`, so the guard would match zero rows,
//      no booking INSERT would run, the unique index would never be violated,
//      and the retry would be reported as GEMS_INSUFFICIENT_BALANCE instead of
//      returning the booking the first attempt created.
//   2. The `booking_redemption_key_uidx` partial unique index, still the ultimate
//      arbiter for two concurrent FIRST attempts on the same key.
//
// The lookup is a read-only fast path, never an authorisation for a mutation, so
// it introduces no TOCTOU window: if it is stale it can only fail to see a
// concurrently-committing booking, and that case falls through to the guarded
// write where the unique index rejects the loser and rolls its deduction back.
export async function redeemServiceWithGems(
  input: RedeemServiceWithGemsInput,
): Promise<RedeemServiceWithGemsResult> {
  // Step 1 — a key we have already honoured resolves straight to its booking,
  // independently of the current balance. Scoped to the owning customer.
  const replayed = await findBookingByRedemptionKey(input.idempotencyKey, input.customerId)
  if (replayed) {
    return {
      duplicate: true,
      bookingId: replayed.id,
      bookingNumber: replayed.bookingNumber,
    }
  }

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
      const found = await findBookingByRedemptionKey(input.idempotencyKey, input.customerId)
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

// Resolve a redemption_key to the booking a previous attempt persisted, for the
// customer who OWNS it. Three call sites: the pre-write replay fast path, the
// answer to a unique-index conflict, and the route's pre-balance-gate replay
// short-circuit (so a retry is never reported as insufficient balance).
//
// `customerId` is NOT optional and is NOT a convenience filter — it is the
// ownership check. The idempotency key is client-supplied, so an unscoped lookup
// would let customer A resolve customer B's booking by guessing a key. Scoping
// the SQL means a key that belongs to someone else simply does not resolve:
// the pre-write path falls through to the guarded write (where the partial unique
// index still rejects the collision) and the conflict path re-raises rather than
// disclosing another customer's booking number.
export async function findBookingByRedemptionKey(
  redemptionKey: string,
  customerId: string,
): Promise<{ id: string; bookingNumber: string } | null> {
  const rows = await db
    .select({ id: booking.id, bookingNumber: booking.bookingNumber })
    .from(booking)
    .where(and(eq(booking.redemptionKey, redemptionKey), eq(booking.customerId, customerId)))
    .limit(1)

  return rows[0] ?? null
}

/** Postgres SQLSTATE for a unique-constraint violation. */
const UNIQUE_VIOLATION = '23505'
/** The partial unique index that enforces redemption idempotency. */
const REDEMPTION_KEY_CONSTRAINT = 'booking_redemption_key_uidx'
/** How far down the `cause` chain to look. Bounded so a cycle cannot hang us. */
const MAX_CAUSE_DEPTH = 5

type DriverErrorLike = {
  code?: unknown
  constraint?: unknown
  message?: unknown
  cause?: unknown
}

// Narrow an unknown driver error to a unique-constraint violation (Postgres
// SQLSTATE 23505) on the redemption_key partial unique index.
//
// Drizzle 0.45.2 does not hand the driver error back directly: it wraps it in a
// `DrizzleQueryError` whose `message` is the attempted SQL and whose `.code` is
// undefined. The Postgres error carrying SQLSTATE 23505 and the constraint name
// sits on `.cause` (and may itself be nested), so the chain has to be walked —
// checking only the outermost error made this predicate always return false and
// turned every legitimate replay into a 500.
//
// Precision matters more than tolerance here: a DIFFERENT unique violation must
// still surface as an error rather than be misreported as a duplicate. So a link
// only counts once its SQLSTATE is 23505, and the constraint name must then match
// — via `.constraint` when the driver provides it, else via the message match
// this predicate has always used as a fallback.
function isRedemptionKeyConflict(error: unknown): boolean {
  let current: unknown = error

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) {
      return false
    }

    const e = current as DriverErrorLike
    if (e.code === UNIQUE_VIOLATION) {
      if (typeof e.constraint === 'string') {
        return e.constraint === REDEMPTION_KEY_CONSTRAINT
      }
      return typeof e.message === 'string' && e.message.includes(REDEMPTION_KEY_CONSTRAINT)
    }

    current = e.cause
  }

  return false
}

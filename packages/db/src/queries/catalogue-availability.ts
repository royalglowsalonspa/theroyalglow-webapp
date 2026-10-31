/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 31-10-2026 & Updated - 31-10-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : catalogue-availability
 * Scope        : Data Access — Service catalogue branch availability
 *
 * Description  : Reads for which branches offer a service (multi-branch
 *                R4.2–R4.4, catalogue-availability.md). Payload writes the
 *                availability (`all_branches` plus `service_branch` /
 *                `service_category_branch`); a service is offered at a branch
 *                when its own availability and its category's both include
 *                it, as `service_available_at` (0034) decides.
 *
 * Responsibilities :
 * - serviceAvailableBranchIds() — select fragment for any query on `service`
 * - getBookingsWithServicesNotOffered(branchId) — the dashboard list (R4.4)
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : drizzle-orm, ../index, ../schema/service
 *
 * Notes        : The trigger `booking_service_availability_guard` (0034)
 *                refuses a new booking line for a service its booking's
 *                branch doesn't offer (check violation, constraint
 *                `booking_service_branch_availability`).
 ************************************************************/

import { AppError, ERROR_CODES } from '@rgss/errors'
import { getTableName, sql } from 'drizzle-orm'
import { db } from '../index'
import { service } from '../schema/service'
import { isConstraintViolation, SQLSTATE } from './driver-errors'

/** The constraint a refused booking line names (0034). */
export const BRANCH_AVAILABILITY_CONSTRAINT = 'booking_service_branch_availability'

/** True when the database refused a booking line its branch doesn't offer. */
export function isBranchAvailabilityRefusal(error: unknown): boolean {
  return isConstraintViolation(error, SQLSTATE.checkViolation, [BRANCH_AVAILABILITY_CONSTRAINT])
}

/**
 * 409 for a write the database refused because a service stopped being
 * offered at the branch after the route checked (a CMS save in between).
 * Nothing was written; choosing again works.
 */
export function serviceNoLongerOffered(): AppError {
  return new AppError({
    code: ERROR_CODES.CONFLICT,
    message: 'The services offered at this branch just changed. Choose the services again.',
    statusCode: 409,
  })
}

/**
 * Select fragment: the branches the outer query's `service` row is offered
 * at. Null when its own and its category's availability are both all
 * branches (every branch, including ones added later); otherwise the branch
 * ids in order, possibly none. Correlated on `"service"."id"`, so it works in
 * any select from the (unaliased) `service` table, joined or not.
 *
 * The correlation is written out as `"service"."id"` on purpose: in a select
 * from one table Drizzle renders an embedded column unqualified (`"id"`),
 * which inside these subqueries would name another table's id.
 */
export function serviceAvailableBranchIds() {
  const outerServiceId = sql`${sql.identifier(getTableName(service))}.${sql.identifier('id')}`
  return sql<string[] | null>`(
    select case
      when s_av.all_branches and c_av.all_branches then null
      else coalesce((
        select json_agg(b_av.id order by b_av.id)
          from branch b_av
         where (s_av.all_branches or exists (
                 select 1 from service_branch sb_av
                  where sb_av.service_id = s_av.id and sb_av.branch_id = b_av.id))
           and (c_av.all_branches or exists (
                 select 1 from service_category_branch cb_av
                  where cb_av.category_id = c_av.id and cb_av.branch_id = b_av.id))
      ), '[]'::json)
    end
      from service s_av
      join service_category c_av on c_av.id = s_av.category_id
     where s_av.id = ${outerServiceId}
  )`
}

/** A booking still to happen with a service its branch no longer offers. */
export type UnofferedServiceBooking = {
  id: string
  bookingNumber: string
  /** YYYY-MM-DD, the IST business date. */
  date: string
  /** HH:MM. */
  startTime: string
  status: string
  customerName: string
  /** The lines' service names as booked, in alphabetical order. */
  services: string[]
}

/**
 * The branch's pending and confirmed bookings, today or later in IST, with a
 * service the branch no longer offers (R4.4), soonest first. Removing
 * availability never changes a booking: each stays listed until reception
 * keeps it to its date, cancels it or the customer rebooks elsewhere.
 */
export async function getBookingsWithServicesNotOffered(
  branchId: string,
): Promise<UnofferedServiceBooking[]> {
  const result = await db.execute(sql`
    select b.id, b.booking_number, to_char(b.booking_date, 'YYYY-MM-DD') as date,
           to_char(b.start_time, 'HH24:MI') as start_time, b.status::text as status,
           u.name as customer_name,
           json_agg(distinct bs.service_name_snapshot) as services
      from booking b
      join "user" u on u.id = b.customer_id
      join booking_service bs on bs.booking_id = b.id
     where b.branch_id = ${branchId}
       and b.status in ('pending', 'confirmed')
       and b.booking_date >= (now() at time zone 'Asia/Kolkata')::date
       and not service_available_at(bs.service_id, b.branch_id)
     group by b.id, u.name
     order by b.booking_date, b.start_time, b.id`)
  const rows = result.rows as {
    id: string
    booking_number: string
    date: string
    start_time: string
    status: string
    customer_name: string
    services: string[] | null
  }[]
  return rows.map((row) => ({
    id: row.id,
    bookingNumber: row.booking_number,
    date: row.date,
    startTime: row.start_time,
    status: row.status,
    customerName: row.customer_name,
    services: [...(row.services ?? [])].sort((a, b) => a.localeCompare(b)),
  }))
}

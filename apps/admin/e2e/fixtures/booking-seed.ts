/************************************************************
 * Module Name  : e2e/fixtures/booking-seed
 * Scope        : Admin E2E — a disposable booking on a closed day
 *                (membership-scheduling.md slice 3)
 *
 * Description  : The salon move and cancel journey needs a confirmed booking
 *                at the branch the browser works in, on a day that branch is
 *                closed, and an open day to move it to. This seeds a
 *                throwaway customer, the booking and the closure, straight
 *                into the database the target server reads (packages/db/.env,
 *                the dev branch drizzle-kit migrates), and deletes everything
 *                the journey wrote afterwards, then proves nothing is left.
 *
 * Notes        : Opt-in (ADMIN_E2E_WRITE_BOOKING_CHANGES=1): the closure
 *                closes a real branch on a day 30 to 90 days ahead until the
 *                clean-up removes it. Both days are open in the branch's
 *                current hours from 11:00 to 12:30 and had no closure. Never
 *                point it at production; the seed refuses a database whose
 *                branch list it can't find the active branch in.
 ************************************************************/
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from '@rgss/db'
import { sql } from 'drizzle-orm'

const here = dirname(fileURLToPath(import.meta.url))
const DB_ENV_FILE = join(here, '..', '..', '..', '..', 'packages', 'db', '.env')

/** Whether the opt-in is set and the dev database's connection string is available. */
export function canSeedBookingChanges(): boolean {
  if (process.env.ADMIN_E2E_WRITE_BOOKING_CHANGES !== '1') {
    return false
  }
  if (!process.env.DATABASE_URL && existsSync(DB_ENV_FILE)) {
    for (const line of readFileSync(DB_ENV_FILE, 'utf8').split(/\r?\n/)) {
      const match = /^\s*DATABASE_URL\s*=\s*(.*)$/.exec(line)
      if (match) {
        process.env.DATABASE_URL = (match[1] ?? '').trim().replace(/^(['"])(.*)\1$/, '$2')
      }
    }
  }
  return Boolean(process.env.DATABASE_URL)
}

export type SeededClosedDayBooking = {
  id: string
  number: string
  customerName: string
  closureName: string
  /** The closed day the booking is on, YYYY-MM-DD. */
  closedDay: string
  /** An open day to move it to, YYYY-MM-DD. */
  openDay: string
}

const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `e2e_bc_${RUN}`
const CLOSURE_NAME = `ZZ E2E closure ${RUN}`

/** A confirmed 11:00–12:00 salon booking at `branchId` on a day the seed closes. */
export async function seedClosedDayBooking(branchId: string): Promise<SeededClosedDayBooking> {
  const found = await db.execute<{ id: string }>(
    sql`select id from branch where id = ${branchId} and status = 'operational'`,
  )
  if (found.rows.length !== 1) {
    throw new Error(`branch ${branchId} isn't on the seeded database; refusing to seed`)
  }
  // Two days, 30 to 90 days ahead in IST, that the branch's current hours keep
  // open from 11:00 to 12:30 and no closure covers.
  const days = await db.execute<{ day: string }>(sql`
    with hours as (
      select business_hours as h from branch_setting
       where branch_id = ${branchId} order by revision desc limit 1
    ), candidates as (
      select d::date as d,
             (array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])[extract(dow from d)::int + 1] as k
        from generate_series((now() at time zone 'Asia/Kolkata')::date + 30,
                             (now() at time zone 'Asia/Kolkata')::date + 90, interval '1 day') d
    )
    select to_char(c.d, 'YYYY-MM-DD') as day
      from candidates c, hours
     where coalesce((hours.h -> c.k ->> 'closed')::boolean, true) = false
       and hours.h -> c.k ->> 'open' <= '11:00'
       and hours.h -> c.k ->> 'close' >= '12:30'
       and not exists (select 1 from holiday x
                        where x.date = to_char(c.d, 'YYYY-MM-DD')
                          and (x.branch_id = ${branchId} or x.branch_id is null))
     order by c.d
     limit 2`)
  const [closedDay, openDay] = days.rows.map((row) => row.day)
  if (!(closedDay && openDay)) {
    throw new Error(`no two open days ahead at ${branchId}; refusing to seed`)
  }
  const service = await db.execute<{ id: string; name: string }>(sql`
    select s.id, s.name from service s join service_category c on c.id = s.category_id
     where s.is_active and c.service_type = 'salon' order by s.id limit 1`)
  const salon = service.rows[0]
  if (!salon) {
    throw new Error('no active salon service to book')
  }

  const customerId = `${PREFIX}_c`
  const customerName = `ZZ E2E Customer ${RUN}`
  const id = `${PREFIX}_b`
  const number = `E2E-BC-${RUN.toUpperCase()}`
  await db.batch([
    db.execute(sql`
      insert into "user" (id, name, email, email_verified, role)
      values (${customerId}, ${customerName}, ${`${customerId}@example.invalid`}, false, 'customer')`),
    db.execute(sql`
      insert into booking (id, booking_number, branch_id, customer_id, status, service_type,
                           booking_date, start_time, end_time, total_amount_paise,
                           total_duration_minutes)
      values (${id}, ${number}, ${branchId}, ${customerId}, 'confirmed', 'salon',
              ${closedDay}::date, '11:00', '12:00', 50000, 60)`),
    db.execute(sql`
      insert into booking_service (id, booking_id, service_id, staff_id, service_name_snapshot,
                                   price_at_booking_paise, duration_minutes, display_order)
      values (${`${PREFIX}_bs`}, ${id}, ${salon.id}, null, ${salon.name}, 50000, 60, 0)`),
    db.execute(sql`
      insert into holiday (id, branch_id, date, name)
      values (${`${PREFIX}_h`}, ${branchId}, ${closedDay}, ${CLOSURE_NAME})`),
  ])
  return { id, number, customerName, closureName: CLOSURE_NAME, closedDay, openDay }
}

/** The booking's slot and status as the database keeps them. */
export async function bookingRow(id: string) {
  const rows = await db.execute<{
    date: string
    start: string
    status: string
    reschedules: number
    reason: string | null
  }>(sql`
    select to_char(booking_date, 'YYYY-MM-DD') as date, to_char(start_time, 'HH24:MI') as start,
           status::text as status, reschedule_count as reschedules,
           cancellation_reason as reason
      from booking where id = ${id}`)
  return rows.rows[0] ?? null
}

/** Delete everything the seed and the journey wrote, then prove nothing is left. */
export async function removeBookingSeed(): Promise<void> {
  const like = `${PREFIX}%`
  const bookings = sql`(select id from booking where customer_id like ${like})`
  await db.batch([
    db.execute(sql`delete from booking_reassignment where booking_id in ${bookings}`),
    db.execute(sql`delete from booking_status_log where booking_id in ${bookings}`),
    db.execute(sql`delete from booking_service where booking_id in ${bookings}`),
    db.execute(sql`delete from booking where customer_id like ${like}`),
    db.execute(sql`delete from holiday where id like ${like} or name = ${CLOSURE_NAME}`),
    db.execute(sql`delete from "user" where id like ${like}`),
  ])
  const left = await db.execute<Record<string, string>>(sql`
    select (select count(*) from booking where customer_id like ${like})::text as bookings,
           (select count(*) from holiday where id like ${like} or name = ${CLOSURE_NAME})::text as closures,
           (select count(*) from "user" where id like ${like})::text as users`)
  const residue = left.rows[0] ?? {}
  if (Object.values(residue).some((n) => n !== '0')) {
    throw new Error(`the booking seed left rows behind: ${JSON.stringify(residue)}`)
  }
}

/************************************************************
 * Module Name  : e2e/fixtures/membership-seed
 * Scope        : Admin E2E — a disposable SPA membership on the dev database
 *
 * Description  : The membership session journey needs an active membership
 *                with free minutes at the branch the browser works in. This
 *                seeds one for a throwaway customer, straight into the
 *                database the target server reads (packages/db/.env, the dev
 *                branch drizzle-kit migrates), and deletes everything the
 *                journey wrote afterwards under the test-fixture flag, then
 *                proves nothing is left.
 *
 * Notes        : Opt-in (ADMIN_E2E_WRITE_MEMBERSHIP_SESSIONS=1): completing a
 *                session takes the branch's next invoice number, which the
 *                clean-up can't give back. Never point it at production; the
 *                seed refuses a database whose branch list it can't find the
 *                active branch in.
 ************************************************************/
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from '@rgss/db'
import { sql } from 'drizzle-orm'

const here = dirname(fileURLToPath(import.meta.url))
const DB_ENV_FILE = join(here, '..', '..', '..', '..', 'packages', 'db', '.env')
const DAY_MS = 24 * 60 * 60 * 1000

/** Whether the opt-in is set and the dev database's connection string is available. */
export function canSeedMemberships(): boolean {
  if (process.env.ADMIN_E2E_WRITE_MEMBERSHIP_SESSIONS !== '1') {
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

export type SeededMembership = {
  id: string
  number: string
  customerId: string
  customerName: string
  minutes: number
}

const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `e2e_ms_${RUN}`

/** An active membership of `minutes`, sold at `branchId`, valid from yesterday for 30 days. */
export async function seedMembership(branchId: string, minutes = 120): Promise<SeededMembership> {
  const found = await db.execute<{ id: string }>(
    sql`select id from branch where id = ${branchId} and status = 'operational'`,
  )
  if (found.rows.length !== 1) {
    throw new Error(`branch ${branchId} isn't on the seeded database; refusing to seed`)
  }
  const customerId = `${PREFIX}_c`
  const customerName = `ZZ E2E Member ${RUN}`
  const tierId = `${PREFIX}_tier`
  const id = `${PREFIX}_m`
  const number = `E2E-MS-${RUN.toUpperCase()}`
  const now = Date.now()
  await db.batch([
    db.execute(sql`
      insert into "user" (id, name, email, email_verified, role)
      values (${customerId}, ${customerName}, ${`${customerId}@example.invalid`}, false, 'customer')`),
    db.execute(sql`
      insert into spa_membership_tier (id, name, slug, default_hours_minutes, default_price_paise,
                                       default_validity_days, is_active)
      values (${tierId}, ${`ZZ E2E ${RUN}`}, ${tierId}, ${minutes}::int, 600000, 30, false)`),
    db.execute(sql`
      insert into spa_membership (id, membership_number, customer_id, tier_id, tier_name_snapshot,
                                  total_hours_minutes, price_paid_paise, starts_at, expires_at,
                                  status, created_by, selling_branch_id)
      values (${id}, ${number}, ${customerId}, ${tierId}, 'ZZ E2E', ${minutes}::int, 600000,
              ${new Date(now - DAY_MS).toISOString()}::timestamptz,
              ${new Date(now + 30 * DAY_MS).toISOString()}::timestamptz,
              'active', ${customerId}, ${branchId})`),
  ])
  return { id, number, customerId, customerName, minutes }
}

/** Delete everything the seed and the journey wrote, then prove nothing is left. */
export async function removeSeed(): Promise<void> {
  const like = `${PREFIX}%`
  const bookings = sql`(select id from booking where customer_id like ${like})`
  await db.batch([
    // Holds, invoices and ledger rows go only under the fixture flag (0022, 0026).
    db.execute(sql`select set_config('rgss.ledger_fixture', 'on', true)`),
    db.execute(sql`delete from settlement_entry where booking_id in ${bookings}`),
    db.execute(sql`delete from membership_hold where booking_id in ${bookings}`),
    db.execute(
      sql`delete from invoice_item where invoice_id in (select id from invoice where customer_id like ${like})`,
    ),
    db.execute(sql`delete from invoice where customer_id like ${like}`),
    db.execute(sql`delete from booking_service where booking_id in ${bookings}`),
    db.execute(sql`delete from booking_status_log where booking_id in ${bookings}`),
    db.execute(sql`delete from booking where customer_id like ${like}`),
    db.execute(sql`delete from spa_membership where customer_id like ${like}`),
    db.execute(sql`delete from spa_membership_tier where id like ${like}`),
    db.execute(sql`delete from "user" where id like ${like}`),
  ])
  const left = await db.execute<Record<string, string>>(sql`
    select (select count(*) from booking where customer_id like ${like})::text as bookings,
           (select count(*) from invoice where customer_id like ${like})::text as invoices,
           (select count(*) from spa_membership where customer_id like ${like})::text as memberships,
           (select count(*) from "user" where id like ${like})::text as users`)
  const residue = left.rows[0] ?? {}
  if (Object.values(residue).some((n) => n !== '0')) {
    throw new Error(`the membership seed left rows behind: ${JSON.stringify(residue)}`)
  }
}

/**
 * A day 1 to 20 days ahead (IST) that `branchId`'s current hours keep open
 * from 11:00 to 12:00 and no closure covers, for a session booked ahead.
 */
export async function openDayAhead(branchId: string): Promise<string> {
  const days = await db.execute<{ day: string }>(sql`
    with hours as (
      select business_hours as h from branch_setting
       where branch_id = ${branchId} order by revision desc limit 1
    ), candidates as (
      select d::date as d,
             (array['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])[extract(dow from d)::int + 1] as k
        from generate_series((now() at time zone 'Asia/Kolkata')::date + 1,
                             (now() at time zone 'Asia/Kolkata')::date + 20, interval '1 day') d
    )
    select to_char(c.d, 'YYYY-MM-DD') as day
      from candidates c, hours
     where coalesce((hours.h -> c.k ->> 'closed')::boolean, true) = false
       and hours.h -> c.k ->> 'open' <= '11:00'
       and hours.h -> c.k ->> 'close' >= '12:00'
       and not exists (select 1 from holiday x
                        where x.date = to_char(c.d, 'YYYY-MM-DD')
                          and (x.branch_id = ${branchId} or x.branch_id is null))
     order by c.d
     limit 1`)
  const day = days.rows[0]?.day
  if (!day) {
    throw new Error(`no open day ahead at ${branchId}`)
  }
  return day
}

/** The membership's totals as the database keeps them. */
export async function membershipTotals(id: string) {
  const rows = await db.execute<{ used: number; reserved: number }>(
    sql`select used_hours_minutes as used, reserved_minutes as reserved
          from spa_membership where id = ${id}`,
  )
  return rows.rows[0] ?? null
}

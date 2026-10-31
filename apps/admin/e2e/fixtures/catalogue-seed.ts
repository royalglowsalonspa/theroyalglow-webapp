/************************************************************
 * Module Name  : e2e/fixtures/catalogue-seed
 * Scope        : Admin E2E — disposable catalogue rows with branch
 *                availability (catalogue-availability.md, tasks §6)
 *
 * Description  : The availability journey needs a service the browser's
 *                branch offers, one only another branch offers, and a booking
 *                still to come that was made before the second was restricted.
 *                This seeds two throwaway services in a real salon category
 *                (public schema only, as the CMS sync would write them), a
 *                throwaway onboarded customer and a pending booking, straight
 *                into the database the target server reads (packages/db/.env,
 *                the dev branch), and deletes everything afterwards, then
 *                proves nothing is left.
 *
 * Notes        : Opt-in (ADMIN_E2E_WRITE_CATALOGUE=1). The services have no
 *                CMS document, so the nightly drift job would list them as
 *                extra rows while they exist; the clean-up removes them.
 *                The booking line is written while the service is still
 *                offered everywhere: the database refuses a new line for a
 *                service its branch doesn't offer (0034).
 ************************************************************/
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from '@rgss/db'
import { sql } from 'drizzle-orm'

const here = dirname(fileURLToPath(import.meta.url))
const DB_ENV_FILE = join(here, '..', '..', '..', '..', 'packages', 'db', '.env')

/** Whether the opt-in is set and the dev database's connection string is available. */
export function canSeedCatalogue(): boolean {
  if (process.env.ADMIN_E2E_WRITE_CATALOGUE !== '1') {
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

export type SeededCatalogue = {
  /** Offered at every branch. */
  here: { id: string; name: string }
  /** Offered only at `otherBranchName`. */
  elsewhere: { id: string; name: string }
  otherBranchName: string
  customerId: string
  customerName: string
  bookingId: string
  bookingNumber: string
  /** The booking's day, YYYY-MM-DD, 30 to 90 days ahead and open 11:00–12:00. */
  day: string
}

const RUN = Math.random()
  .toString(36)
  .replace(/[^a-z]/g, '')
  .slice(0, 6)
  .padEnd(6, 'q')
const PREFIX = `e2e_cav_${RUN}`

export async function seedCatalogueAvailability(branchId: string): Promise<SeededCatalogue> {
  const found = await db.execute<{ id: string }>(
    sql`select id from branch where id = ${branchId} and status = 'operational'`,
  )
  if (found.rows.length !== 1) {
    throw new Error(`branch ${branchId} isn't on the seeded database; refusing to seed`)
  }
  const other = await db.execute<{ id: string; name: string }>(
    sql`select id, name from branch where id <> ${branchId} order by display_order, number limit 1`,
  )
  const otherBranch = other.rows[0]
  if (!otherBranch) {
    throw new Error('no second branch to restrict a service to')
  }
  const category = await db.execute<{ id: string }>(sql`
    select id from service_category
     where is_active and all_branches and service_type = 'salon' and sac_code is not null
     order by display_order limit 1`)
  const categoryId = category.rows[0]?.id
  if (!categoryId) {
    throw new Error('no active salon category offered at every branch')
  }
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
       and hours.h -> c.k ->> 'close' >= '12:00'
       and not exists (select 1 from holiday x
                        where x.date = to_char(c.d, 'YYYY-MM-DD')
                          and (x.branch_id = ${branchId} or x.branch_id is null))
     order by c.d
     limit 1`)
  const day = days.rows[0]?.day
  if (!day) {
    throw new Error(`no open day ahead at ${branchId}; refusing to seed`)
  }

  const hereService = { id: `${PREFIX}_here`, name: `ZZ E2E Here ${RUN}` }
  const elsewhere = { id: `${PREFIX}_away`, name: `ZZ E2E Elsewhere ${RUN}` }
  const customerId = `${PREFIX}_c`
  const customerName = `ZZ E2E Customer ${RUN}`
  const bookingId = `${PREFIX}_b`
  const bookingNumber = `E2E-CAV-${RUN.toUpperCase()}`
  await db.batch([
    db.execute(sql`
      insert into service (id, category_id, name, slug, duration_minutes, price_paise,
                           all_branches, display_order)
      values (${hereService.id}, ${categoryId}, ${hereService.name}, ${hereService.id}, 60, 50000, true, 0),
             (${elsewhere.id}, ${categoryId}, ${elsewhere.name}, ${elsewhere.id}, 60, 50000, true, 0)`),
    db.execute(sql`
      insert into "user" (id, name, email, email_verified, role)
      values (${customerId}, ${customerName}, ${`${customerId}@example.invalid`}, false, 'customer')`),
    db.execute(sql`
      insert into customer_profile (id, user_id) values (${`${PREFIX}_cp`}, ${customerId})`),
    db.execute(sql`
      insert into booking (id, booking_number, branch_id, customer_id, status, service_type,
                           booking_date, start_time, end_time, total_amount_paise,
                           total_duration_minutes)
      values (${bookingId}, ${bookingNumber}, ${branchId}, ${customerId}, 'pending', 'salon',
              ${day}::date, '11:00', '12:00', 50000, 60)`),
    db.execute(sql`
      insert into booking_service (id, booking_id, service_id, staff_id, service_name_snapshot,
                                   price_at_booking_paise, duration_minutes, display_order)
      values (${`${PREFIX}_bs`}, ${bookingId}, ${elsewhere.id}, null, ${elsewhere.name}, 50000, 60, 0)`),
  ])
  // Now only the other branch offers it, as a CMS save of "Selected branches"
  // writes it.
  await db.batch([
    db.execute(sql`update service set all_branches = false where id = ${elsewhere.id}`),
    db.execute(
      sql`insert into service_branch (service_id, branch_id) values (${elsewhere.id}, ${otherBranch.id})`,
    ),
  ])
  return {
    here: hereService,
    elsewhere,
    otherBranchName: otherBranch.name,
    customerId,
    customerName,
    bookingId,
    bookingNumber,
    day,
  }
}

/** Delete everything the seed and the journey wrote, then prove nothing is left. */
export async function removeCatalogueSeed(): Promise<void> {
  const like = `${PREFIX}%`
  const bookings = sql`(select id from booking where customer_id like ${like})`
  await db.batch([
    db.execute(sql`delete from booking_reassignment where booking_id in ${bookings}`),
    db.execute(sql`delete from booking_status_log where booking_id in ${bookings}`),
    db.execute(sql`delete from booking_service where booking_id in ${bookings}`),
    db.execute(sql`delete from booking where customer_id like ${like}`),
    db.execute(sql`delete from customer_profile where user_id like ${like}`),
    db.execute(sql`delete from "user" where id like ${like}`),
    db.execute(sql`delete from service where id like ${like}`),
  ])
  const left = await db.execute<Record<string, string>>(sql`
    select (select count(*) from booking where customer_id like ${like})::text as bookings,
           (select count(*) from service where id like ${like})::text as services,
           (select count(*) from service_branch where service_id like ${like})::text as service_rows,
           (select count(*) from "user" where id like ${like})::text as users`)
  const residue = left.rows[0] ?? {}
  if (Object.values(residue).some((n) => n !== '0')) {
    throw new Error(`the catalogue seed left rows behind: ${JSON.stringify(residue)}`)
  }
}

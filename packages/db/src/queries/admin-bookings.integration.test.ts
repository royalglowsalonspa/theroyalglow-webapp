/************************************************************
 * Module Name  : admin-bookings.integration.test
 * Scope        : Integration test — branch-scoped admin booking queries (REAL db)
 *
 * Description  : The admin booking reads and writes against Neon dev, with two
 *                throwaway branches A and B (multi-branch R2.3):
 *                  - the list and the detail read return only the branch's own
 *                    bookings;
 *                  - approve and assign never touch a booking at another
 *                    branch, even when called with its id;
 *                  - the default staff for a service, and assignment checks,
 *                    come from the branch only;
 *                  - the invoice ledger and every report figure count only the
 *                    branch's own invoices and bookings.
 *
 * Skip behaviour : Skips without packages/db/.env (CI). Run it locally with
 *                `bun run test:integration`.
 *
 * Data hygiene : Prefixed `abk_it_<run>` rows, deleted in one transaction in
 *                afterAll, then zero residue is proven. The branches reuse the
 *                primary branch's Owner, who keeps their own branches.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import { issuedInvoiceStatements } from '../test/issued-invoice'
import { isLiveDbAvailable, queryRow, queryRows } from '../test/live-db'
import { approveBooking, assignStaff, getBookingForAdmin, listBookings } from './admin-bookings'
import { createBookingWithServices, getDefaultStaffForService } from './bookings'
import { getInvoiceById, getInvoices } from './invoices'
import { getBookingsByStatus, getRevenueSummary, getTopServices } from './reports'
import { isStaffAtBranch } from './staff'

const LIVE = isLiveDbAvailable()
const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `abk_it_${RUN}`
const BRANCH_A = `${PREFIX}_a`
const BRANCH_B = `${PREFIX}_b`
const CUSTOMER = `${PREFIX}_customer`
const STYLIST_A = `${PREFIX}_sty_a`
const STYLIST_B = `${PREFIX}_sty_b`
const PROFILE_A = `${STYLIST_A}_p`
const PROFILE_B = `${STYLIST_B}_p`
const ACTOR = `${PREFIX}_actor`

let serviceId = ''
let bookingA = ''
let bookingB = ''

async function book(branchId: string, number: string): Promise<string> {
  const created = await createBookingWithServices(
    {
      bookingNumber: `${PREFIX}_${number}`,
      branchId,
      customerId: CUSTOMER,
      status: 'pending',
      serviceType: 'salon',
      bookingDate: new Date('2099-01-01T00:00:00.000Z'),
      startTime: '10:00',
      endTime: '10:30',
      totalAmountPaise: 50_000,
      totalDurationMinutes: 30,
    },
    [
      {
        serviceId,
        staffId: null,
        serviceNameSnapshot: 'Integration service',
        priceAtBookingPaise: 50_000,
        durationMinutes: 30,
        displayOrder: 0,
      },
    ],
  )
  return created.id
}

describe.skipIf(!LIVE)('branch-scoped admin booking queries against a live database', () => {
  beforeAll(async () => {
    const owner = await queryRow<{ id: string }>(
      sql`select owner_user_id as id from branch order by is_primary desc, display_order limit 1`,
    )
    const service = await queryRow<{ id: string }>(
      sql`select id from service where is_active = true order by id limit 1`,
    )
    serviceId = service?.id ?? ''
    const number = 9700 + Math.floor(Math.random() * 90)

    // People, branches and profiles together: the deferred role triggers check
    // them as a whole when the batch commits.
    await db.batch([
      db.execute(sql`
        insert into "user" (id, name, email, email_verified, role)
        values (${CUSTOMER}, 'ZZ Booking IT customer', ${`${CUSTOMER}@example.invalid`}, false, 'customer'),
               (${ACTOR}, 'ZZ Booking IT actor', ${`${ACTOR}@example.invalid`}, false, 'customer'),
               (${STYLIST_A}, 'ZZ Booking IT stylist A', ${`${STYLIST_A}@example.invalid`}, false, 'staff'),
               (${STYLIST_B}, 'ZZ Booking IT stylist B', ${`${STYLIST_B}@example.invalid`}, false, 'staff')`),
      db.execute(sql`
        insert into branch (id, number, code, name, address_line1, pincode, phone, display_order, owner_user_id)
        values (${BRANCH_A}, ${number}, ${`${PREFIX}_A`}, 'ZZ Booking IT A', 'Test', '560100', '0000000000', 960, ${owner?.id ?? ''}),
               (${BRANCH_B}, ${number + 1}, ${`${PREFIX}_B`}, 'ZZ Booking IT B', 'Test', '560100', '0000000000', 961, ${owner?.id ?? ''})`),
      db.execute(sql`
        insert into staff_profile (id, user_id, designation, is_active, role_witness, branch_id)
        values (${PROFILE_A}, ${STYLIST_A}, 'stylist', true, 'staff', ${BRANCH_A}),
               (${PROFILE_B}, ${STYLIST_B}, 'stylist', true, 'staff', ${BRANCH_B})`),
      // Only B's stylist is mapped to the service.
      db.execute(
        sql`insert into staff_service (staff_id, service_id) values (${PROFILE_B}, ${serviceId})`,
      ),
    ])

    bookingA = await book(BRANCH_A, 'A')
    bookingB = await book(BRANCH_B, 'B')
  })

  afterAll(async () => {
    const like = `${PREFIX}%`
    await db.batch([
      db.execute(sql`delete from invoice_item where invoice_id like ${like}`),
      db.execute(sql`delete from invoice where id like ${like}`),
      db.execute(
        sql`delete from booking_status_log where booking_id in (select id from booking where booking_number like ${like})`,
      ),
      db.execute(
        sql`delete from booking_service where booking_id in (select id from booking where booking_number like ${like})`,
      ),
      db.execute(sql`delete from booking where booking_number like ${like}`),
      db.execute(sql`delete from staff_service where staff_id like ${like}`),
      db.execute(sql`delete from staff_profile where id like ${like}`),
      db.execute(sql`delete from branch where id like ${like}`),
      db.execute(sql`delete from "user" where id like ${like}`),
    ])
    expect(
      await queryRow(sql`
        select (select count(*) from booking where booking_number like ${like}) as bookings,
               (select count(*) from branch where id like ${like}) as branches,
               (select count(*) from "user" where id like ${like}) as users`),
    ).toEqual({ bookings: '0', branches: '0', users: '0' })
  })

  it('lists only the branch’s own bookings', async () => {
    const atA = (await listBookings(BRANCH_A)).map((b) => b.id)
    const atB = (await listBookings(BRANCH_B, { status: 'pending' })).map((b) => b.id)

    expect(atA).toEqual([bookingA])
    expect(atB).toEqual([bookingB])
  })

  it('reads a booking only at its own branch', async () => {
    expect(await getBookingForAdmin(bookingB, BRANCH_A)).toBeNull()
    expect((await getBookingForAdmin(bookingB, BRANCH_B))?.id).toBe(bookingB)
  })

  it('never approves a booking through another branch', async () => {
    expect(await approveBooking(bookingB, BRANCH_A, ACTOR, PROFILE_A)).toBeNull()

    expect(await queryRow(sql`select status from booking where id = ${bookingB}`)).toEqual({
      status: 'pending',
    })
    expect(
      await queryRows(sql`select id from booking_status_log where booking_id = ${bookingB}`),
    ).toEqual([])
  })

  it('never reassigns the services of a booking at another branch', async () => {
    expect(await assignStaff(bookingA, BRANCH_B, PROFILE_B, ACTOR)).toEqual([])
    expect(
      await queryRow(sql`select staff_id from booking_service where booking_id = ${bookingA}`),
    ).toEqual({ staff_id: null })

    const assigned = await assignStaff(bookingA, BRANCH_A, PROFILE_A, ACTOR)
    expect(assigned.map((s) => s.staffId)).toEqual([PROFILE_A])
  })

  it('picks default staff from the branch, preferring someone mapped to the service', async () => {
    // B's stylist performs the service but works at B, so A gets its own stylist.
    expect(await getDefaultStaffForService(serviceId, BRANCH_A)).toBe(PROFILE_A)
    expect(await getDefaultStaffForService(serviceId, BRANCH_B)).toBe(PROFILE_B)
  })

  it('says who works at the branch', async () => {
    expect(await isStaffAtBranch(PROFILE_A, BRANCH_A)).toBe(true)
    expect(await isStaffAtBranch(PROFILE_A, BRANCH_B)).toBe(false)
  })

  // Nested so it shares the branches and bookings above and their cleanup.
  describe('billing and reports', () => {
    const DAY = '2099-01-01'
    const INVOICE_A = `${PREFIX}_inv_a`
    const INVOICE_B = `${PREFIX}_inv_b`

    beforeAll(async () => {
      // The booking suite above seeds the branches, customer and bookings; this
      // one adds one paid invoice per branch, paid on DAY (IST).
      // Issued with their snapshot (0018); numbers are at most 16 characters.
      const paidAt = new Date(`${DAY}T06:00:00.000Z`)
      const [first, ...rest] = [
        ...(await issuedInvoiceStatements({
          id: INVOICE_A,
          number: `ZZ${RUN}A`,
          sequence: 1,
          branchId: BRANCH_A,
          customerId: CUSTOMER,
          bookingId: bookingA,
          taxPointAt: paidAt,
          lines: [{ name: 'ZZ IT service A', amountPaise: 50_000 }],
        })),
        ...(await issuedInvoiceStatements({
          id: INVOICE_B,
          number: `ZZ${RUN}B`,
          sequence: 1,
          branchId: BRANCH_B,
          customerId: CUSTOMER,
          bookingId: bookingB,
          taxPointAt: paidAt,
          lines: [{ name: 'ZZ IT service B', amountPaise: 120_000 }],
        })),
      ]
      if (!first) {
        throw new Error('no invoice statements')
      }
      await db.batch([first, ...rest])
    })

    it('keeps each branch’s invoice ledger to its own invoices', async () => {
      const query = { page: 1, pageSize: 50, q: PREFIX } as const
      const atA = await getInvoices(BRANCH_A, query)

      expect(atA.rows.map((r) => r.id)).toEqual([INVOICE_A])
      expect(atA.totalCount).toBe(1)
      expect(await getInvoiceById(INVOICE_B, BRANCH_A)).toBeNull()
      expect((await getInvoiceById(INVOICE_B, BRANCH_B))?.items).toHaveLength(1)
    })

    it('counts only the branch’s own money and bookings in every report', async () => {
      const range = { from: DAY, to: DAY }

      const summaryA = await getRevenueSummary(BRANCH_A, range)
      const summaryB = await getRevenueSummary(BRANCH_B, range)
      expect(summaryA).toMatchObject({ rangeRevenuePaise: 50000, invoiceCount: 1, bookingCount: 1 })
      expect(summaryB).toMatchObject({
        rangeRevenuePaise: 120000,
        invoiceCount: 1,
        bookingCount: 1,
      })

      expect((await getTopServices(BRANCH_A, range)).map((s) => s.name)).toEqual([
        'ZZ IT service A',
      ])
      const statusesA = await getBookingsByStatus(BRANCH_A, range)
      expect(statusesA.reduce((n, s) => n + s.count, 0)).toBe(1)
    })
  })
})

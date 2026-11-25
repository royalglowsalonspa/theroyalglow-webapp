/************************************************************
 * Module Name  : branch-jobs.integration.test
 * Scope        : Integration test — branch context for background jobs (REAL db)
 *
 * Description  : Against Neon dev: getBranchPeople reads each branch's Owner,
 *                Manager and Receptionist as the role keys define them; the
 *                daily and weekly revenue is split by branch and invoice
 *                issuer, with new
 *                and returning customers counted per branch; and
 *                hasNotificationSince bounds the daily de-duplication.
 *                (multi-branch R1.9, R6.5, R7.4)
 *
 * Skip behaviour : Skips without packages/db/.env (CI).
 *
 * Data hygiene : Prefixed `bjob_it_<run>` rows on dates in 2099, deleted in one
 *                transaction in afterAll, then zero residue is proven. The
 *                fixture branches reuse the real Owner (the Owner key needs
 *                an account that holds the role).
 ************************************************************/

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import { issuedInvoiceStatements } from '../test/issued-invoice'
import { isLiveDbAvailable, queryRow } from '../test/live-db'
import { createBookingWithServices } from './bookings'
import { getBranchPeople } from './branch-recipients'
import {
  closeLapsedPendingBookings,
  getDailyBranchReports,
  getUpcomingConfirmedBookings,
  getWeeklyBranchReports,
  hasNotificationSince,
} from './jobs'
import { createNotificationOnce } from './notifications'

const LIVE = isLiveDbAvailable()
// The closeout job writes globally, so exercise it only against the CI action's
// disposable loopback cluster, even when a developer database is configured.
const SYNTHETIC =
  Boolean(process.env.REHEARSAL_PG_DATA) &&
  Boolean(process.env.RGSS_LOCAL_DB_PRELOAD) &&
  URL.parse(process.env.DATABASE_URL ?? '')?.hostname === '127.0.0.1'
const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `bjob_it_${RUN}`
const BRANCH_A = `${PREFIX}_a`
const BRANCH_B = `${PREFIX}_b`
const MANAGER = `${PREFIX}_mgr`
const RECEPTION = `${PREFIX}_rcp`
const ASHA = `${PREFIX}_asha`
const RAVI = `${PREFIX}_ravi`
const FIRST_ISSUER_GSTIN = '29ABCDE1234F1Z5'
const SECOND_ISSUER_GSTIN = '29ABCDE1234F1Z6'
const CURRENT_BRANCH_GSTIN = '29ABCDE1234F1Z7'

let ownerId = ''
let serviceId = ''
// The fixture invoices' numbers, unique across the suite's branches.
let sequence = 0

async function book(params: {
  key: string
  branchId: string
  customerId: string
  status: 'completed' | 'cancelled' | 'pending' | 'confirmed'
  serviceType: 'salon' | 'spa'
  day: string
  startTime?: string
  endTime?: string
  totalAmountPaise: number
  isWalkin?: boolean
}) {
  const created = await createBookingWithServices(
    {
      bookingNumber: `${PREFIX}_${params.key}`,
      branchId: params.branchId,
      customerId: params.customerId,
      status: params.status,
      serviceType: params.serviceType,
      bookingDate: new Date(`${params.day}T00:00:00.000Z`),
      startTime: params.startTime ?? '10:00',
      endTime: params.endTime ?? '11:00',
      totalAmountPaise: params.totalAmountPaise,
      totalDurationMinutes: 60,
      isWalkin: params.isWalkin ?? false,
    },
    [
      {
        serviceId,
        staffId: null,
        serviceNameSnapshot: `ZZ IT ${params.key}`,
        priceAtBookingPaise: params.totalAmountPaise,
        durationMinutes: 60,
        displayOrder: 0,
      },
    ],
  )
  return created.id
}

async function invoice(params: {
  key: string
  branchId: string
  bookingId: string
  customerId: string
  totalPaise: number
  paid: boolean
  createdAt: string
  issuerGstin?: string
}) {
  // Issued with its snapshot (0018): numbered within its branch, the number at
  // most 16 characters, its tax point the moment it was created.
  sequence += 1
  await db.batch(
    await issuedInvoiceStatements({
      id: `${PREFIX}_inv_${params.key}`,
      number: `ZZ${RUN}${sequence}`,
      sequence,
      branchId: params.branchId,
      customerId: params.customerId,
      bookingId: params.bookingId,
      paymentStatus: params.paid ? 'paid' : 'pending',
      taxPointAt: new Date(params.createdAt),
      ...(params.issuerGstin === undefined ? {} : { issuerGstin: params.issuerGstin }),
      lines: [{ name: `ZZ IT ${params.key}`, amountPaise: params.totalPaise }],
    }),
  )
}

describe.skipIf(!LIVE)('branch context for background jobs against a live database', () => {
  beforeAll(async () => {
    const owner = await queryRow<{ id: string }>(
      sql`select owner_user_id as id from branch order by is_primary desc, display_order limit 1`,
    )
    ownerId = owner?.id ?? ''
    const service = await queryRow<{ id: string }>(
      sql`select id from service where is_active = true order by id limit 1`,
    )
    serviceId = service?.id ?? ''
    const number = 9700 + Math.floor(Math.random() * 90)

    // One transaction: the deferred role checks see the Manager's branch and
    // profile, and the Receptionist's profile, at commit.
    await db.batch([
      db.execute(sql`
        insert into "user" (id, name, email, email_verified, role)
        values (${MANAGER}, 'ZZ Bjob IT Manager', ${`${MANAGER}@example.invalid`}, false, 'manager'),
               (${RECEPTION}, 'ZZ Bjob IT Reception', ${`${RECEPTION}@example.invalid`}, false, 'receptionist'),
               (${ASHA}, 'ZZ Bjob IT Asha', ${`${ASHA}@example.invalid`}, false, 'customer'),
               (${RAVI}, 'ZZ Bjob IT Ravi', ${`${RAVI}@example.invalid`}, false, 'customer')`),
      db.execute(sql`
        insert into branch (id, number, code, name, address_line1, pincode, phone, display_order,
                            owner_user_id, manager_user_id)
        values (${BRANCH_A}, ${number}, ${`${PREFIX}_A`}, 'ZZ Bjob IT A', 'Test', '560100', '0000000000', 980,
                ${ownerId}, ${MANAGER}),
               (${BRANCH_B}, ${number + 1}, ${`${PREFIX}_B`}, 'ZZ Bjob IT B', 'Test', '560100', '0000000000', 981,
                ${ownerId}, null)`),
      db.execute(sql`
        insert into staff_profile (id, user_id, designation, is_active, branch_id, role_witness)
        values (${`${MANAGER}_p`}, ${MANAGER}, 'manager', true, null, 'manager'),
               (${`${RECEPTION}_p`}, ${RECEPTION}, 'receptionist', true, ${BRANCH_A}, 'receptionist')`),
    ])

    // Ravi's first ever booking: A on 01/03/2099. On 02/03 Asha is new at A
    // and has two bookings that day; Ravi returns at B (paid SPA visit) and
    // cancels a walk-in there too.
    const raviFirst = await book({
      key: 'ravi_first',
      branchId: BRANCH_A,
      customerId: RAVI,
      status: 'completed',
      serviceType: 'salon',
      day: '2099-03-01',
      totalAmountPaise: 30_000,
    })
    const ashaA = await book({
      key: 'asha_a',
      branchId: BRANCH_A,
      customerId: ASHA,
      status: 'completed',
      serviceType: 'salon',
      day: '2099-03-02',
      totalAmountPaise: 50_000,
    })
    const ashaSecond = await book({
      key: 'asha_second',
      branchId: BRANCH_A,
      customerId: ASHA,
      status: 'completed',
      serviceType: 'salon',
      day: '2099-03-02',
      totalAmountPaise: 20_000,
    })
    const raviB = await book({
      key: 'ravi_b',
      branchId: BRANCH_B,
      customerId: RAVI,
      status: 'completed',
      serviceType: 'spa',
      day: '2099-03-02',
      totalAmountPaise: 80_000,
    })
    const raviWalkin = await book({
      key: 'ravi_walkin',
      branchId: BRANCH_B,
      customerId: RAVI,
      status: 'cancelled',
      serviceType: 'spa',
      day: '2099-03-02',
      totalAmountPaise: 40_000,
      isWalkin: true,
    })

    // 06:00 UTC is 11:30 IST: each invoice falls on its booking's IST day.
    await invoice({
      key: 'ravi_first',
      branchId: BRANCH_A,
      bookingId: raviFirst,
      customerId: RAVI,
      totalPaise: 30_000,
      paid: true,
      createdAt: '2099-03-01T06:00:00Z',
      issuerGstin: FIRST_ISSUER_GSTIN,
    })
    await invoice({
      key: 'asha_a',
      branchId: BRANCH_A,
      bookingId: ashaA,
      customerId: ASHA,
      totalPaise: 50_000,
      paid: true,
      createdAt: '2099-03-02T06:00:00Z',
      issuerGstin: FIRST_ISSUER_GSTIN,
    })
    await invoice({
      key: 'asha_second',
      branchId: BRANCH_A,
      bookingId: ashaSecond,
      customerId: ASHA,
      totalPaise: 20_000,
      paid: true,
      createdAt: '2099-03-02T07:00:00Z',
      issuerGstin: SECOND_ISSUER_GSTIN,
    })
    await invoice({
      key: 'ravi_b',
      branchId: BRANCH_B,
      bookingId: raviB,
      customerId: RAVI,
      totalPaise: 80_000,
      paid: true,
      createdAt: '2099-03-02T08:00:00Z',
    })
    // Unpaid: never counted.
    await invoice({
      key: 'ravi_walkin',
      branchId: BRANCH_B,
      bookingId: raviWalkin,
      customerId: RAVI,
      totalPaise: 40_000,
      paid: false,
      createdAt: '2099-03-02T09:00:00Z',
    })
    await db.execute(sql`update branch set gstin = ${CURRENT_BRANCH_GSTIN} where id = ${BRANCH_A}`)
  }, 30_000)

  afterAll(async () => {
    const like = `${PREFIX}%`
    await db.batch([
      db.execute(sql`delete from notification where user_id like ${like}`),
      db.execute(
        sql`delete from invoice_item where invoice_id in (select id from invoice where id like ${like})`,
      ),
      db.execute(sql`delete from invoice where id like ${like}`),
      db.execute(
        sql`delete from booking_status_log where booking_id in (select id from booking where booking_number like ${like})`,
      ),
      db.execute(
        sql`delete from booking_service where booking_id in (select id from booking where booking_number like ${like})`,
      ),
      db.execute(sql`delete from booking where booking_number like ${like}`),
      db.execute(sql`delete from staff_profile where user_id like ${like}`),
      db.execute(sql`delete from branch where id like ${like}`),
      db.execute(sql`delete from "user" where id like ${like}`),
    ])
    expect(
      await queryRow(sql`
        select (select count(*) from booking where booking_number like ${like}) as bookings,
               (select count(*) from invoice where id like ${like}) as invoices,
               (select count(*) from notification where user_id like ${like}) as notifications,
               (select count(*) from staff_profile where user_id like ${like}) as profiles,
               (select count(*) from branch where id like ${like}) as branches,
               (select count(*) from "user" where id like ${like}) as users`),
    ).toEqual({
      bookings: '0',
      invoices: '0',
      notifications: '0',
      profiles: '0',
      branches: '0',
      users: '0',
    })
  })

  it("reads each branch's Owner, Manager and Receptionist", async () => {
    const { branches, developer } = await getBranchPeople([BRANCH_A, BRANCH_B])
    expect(branches.map((b) => b.id)).toEqual([BRANCH_A, BRANCH_B])

    const [a, b] = branches
    expect(a?.owner?.userId).toBe(ownerId)
    expect(a?.manager).toEqual({
      userId: MANAGER,
      name: 'ZZ Bjob IT Manager',
      email: `${MANAGER}@example.invalid`,
    })
    expect(a?.receptionist?.userId).toBe(RECEPTION)
    expect(b?.owner?.userId).toBe(ownerId)
    expect(b?.manager).toBeNull()
    expect(b?.receptionist).toBeNull()

    const dev = await queryRow<{ id: string }>(sql`select id from "user" where role = 'developer'`)
    expect(developer?.userId ?? null).toBe(dev?.id ?? null)
  })

  it('reads every branch, one branch, or nothing', async () => {
    const all = await getBranchPeople()
    const count = await queryRow<{ n: string }>(sql`select count(*) as n from branch`)
    expect(String(all.branches.length)).toBe(count?.n)
    expect(all.branches.some((b) => b.id === BRANCH_B)).toBe(true)

    const onlyB = await getBranchPeople([BRANCH_B, BRANCH_B])
    expect(onlyB.branches.map((b) => b.id)).toEqual([BRANCH_B])

    expect(await getBranchPeople([])).toEqual({ branches: [], developer: null })
  })

  it("splits a day's figures by branch and stored issuer, with customer counts per branch", async () => {
    const report = await getDailyBranchReports('2099-03-02')
    expect([...report.branches.keys()].sort()).toEqual([BRANCH_A, BRANCH_B].sort())

    expect(report.branches.get(BRANCH_A)).toEqual({
      services: [
        { name: 'ZZ IT asha_a', qty: 1, revenuePaise: 50_000 },
        { name: 'ZZ IT asha_second', qty: 1, revenuePaise: 20_000 },
      ],
      revenue: { salonPaise: 70_000, spaPaise: 0, membershipPaise: 0, totalPaise: 70_000 },
      issuerRevenue: [
        { gstin: FIRST_ISSUER_GSTIN, name: 'ZZ Bjob IT A', totalPaise: 50_000 },
        { gstin: SECOND_ISSUER_GSTIN, name: 'ZZ Bjob IT A', totalPaise: 20_000 },
      ],
      bookings: { completed: 2, noShows: 0, cancelled: 0, walkIns: 0 },
      customers: { newCount: 1, returning: 0 },
      membershipSessions: 0,
    })
    expect(report.branches.get(BRANCH_B)).toEqual({
      services: [{ name: 'ZZ IT ravi_b', qty: 1, revenuePaise: 80_000 }],
      revenue: { salonPaise: 0, spaPaise: 80_000, membershipPaise: 0, totalPaise: 80_000 },
      issuerRevenue: [{ gstin: null, name: 'ZZ Bjob IT B', totalPaise: 80_000 }],
      bookings: { completed: 1, noShows: 0, cancelled: 1, walkIns: 1 },
      customers: { newCount: 0, returning: 1 },
      membershipSessions: 0,
    })
  })

  it('adds up a week per branch and issuer while retaining the branch totals', async () => {
    const report = await getWeeklyBranchReports('2099-02-24', '2099-03-02')
    expect(report.periodStart.toISOString()).toBe('2099-02-24T00:00:00.000Z')
    expect(report.periodEnd.toISOString()).toBe('2099-03-02T00:00:00.000Z')

    const a = report.branches.get(BRANCH_A)
    expect(a?.revenue.totalPaise).toBe(100_000)
    expect(a?.issuerRevenue).toEqual([
      { gstin: FIRST_ISSUER_GSTIN, name: 'ZZ Bjob IT A', totalPaise: 80_000 },
      { gstin: SECOND_ISSUER_GSTIN, name: 'ZZ Bjob IT A', totalPaise: 20_000 },
    ])
    expect(a?.bookings.completed).toBe(3)
    expect(a?.customers).toEqual({ newCount: 2, returning: 0 })
    // Highest revenue first.
    expect(a?.services.map((s) => s.name)).toEqual([
      'ZZ IT asha_a',
      'ZZ IT ravi_first',
      'ZZ IT asha_second',
    ])

    const b = report.branches.get(BRANCH_B)
    expect(b?.revenue.totalPaise).toBe(80_000)
    expect(b?.customers).toEqual({ newCount: 0, returning: 1 })

    expect((await getWeeklyBranchReports('2099-02-10', '2099-02-16')).branches.size).toBe(0)
  })

  it('reads the latest move as the reminder occurrence boundary for a confirmed booking', async () => {
    const id = await book({
      key: 'appointment_reminder',
      branchId: BRANCH_A,
      customerId: ASHA,
      status: 'confirmed',
      serviceType: 'salon',
      day: '2099-03-07',
      totalAmountPaise: 20_000,
    })
    const movedAt = '2099-03-03T05:00:00.000Z'
    await db.execute(sql`
      insert into booking_status_log (id, booking_id, from_status, to_status, changed_by_id, notes, created_at)
      values
        (${`${PREFIX}_move_log`}, ${id}, 'confirmed', 'confirmed', ${ownerId},
          'Rescheduled to 2099-03-07 10:00', ${movedAt}::timestamptz),
        (${`${PREFIX}_later_log`}, ${id}, 'confirmed', 'confirmed', ${ownerId},
          'Unrelated note', '2099-03-04T05:00:00.000Z')
    `)

    const upcoming = await getUpcomingConfirmedBookings(new Date('2099-03-06T04:30:00.000Z'))
    expect(upcoming.find((row) => row.id === id)?.slotAcceptedAt).toEqual(new Date(movedAt))
  })

  it('bounds the daily de-duplication by the given instant', async () => {
    await db.execute(sql`
      insert into notification (id, user_id, type, title, body, channel)
      values (${`${PREFIX}_n1`}, ${ASHA}, 'lead_follow_up_due', 'T', 'B', 'push')`)

    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const inAnHour = new Date(Date.now() + 60 * 60 * 1000)
    expect(await hasNotificationSince(ASHA, 'lead_follow_up_due', anHourAgo)).toBe(true)
    expect(await hasNotificationSince(ASHA, 'lead_follow_up_due', inAnHour)).toBe(false)
    expect(await hasNotificationSince(ASHA, 'branch_manager_missing', anHourAgo)).toBe(false)
    expect(await hasNotificationSince(RAVI, 'lead_follow_up_due', anHourAgo)).toBe(false)
  })

  it.runIf(SYNTHETIC)('closes an overnight pending booking at its next-day IST end', async () => {
    // Earlier than the other integration fixtures, so the global job only sees
    // this appointment and leaves parallel suites' fixtures alone.
    const id = await book({
      key: 'overnight_closeout',
      branchId: BRANCH_A,
      customerId: ASHA,
      status: 'pending',
      serviceType: 'salon',
      day: '2021-02-01',
      startTime: '23:15',
      endTime: '00:15',
      totalAmountPaise: 0,
    })
    const end = new Date('2021-02-01T18:45:00.000Z')
    const before = await closeLapsedPendingBookings(new Date(end.getTime() - 1))
    expect(before.some((booking) => booking.id === id)).toBe(false)
    const closed = await closeLapsedPendingBookings(end)
    expect(closed).toEqual(expect.arrayContaining([expect.objectContaining({ id })]))
    expect(await queryRow(sql`select status from booking where id = ${id}`)).toEqual({
      status: 'no_show',
    })
  })

  it('claims one notification for simultaneous checks of the same booking slot', async () => {
    const booking = await queryRow<{ id: string }>(
      sql`select id from booking where booking_number = ${`${PREFIX}_asha_a`}`,
    )
    if (!booking) throw new Error('Expected a seeded branch booking')
    const claim = {
      id: `${PREFIX}_no_show`,
      bookingId: booking.id,
      userId: RECEPTION,
      type: 'no_show_check',
      title: 'Review missed booking',
      body: 'Check the booking status.',
    } as const

    const results = await Promise.all([
      createNotificationOnce(claim),
      createNotificationOnce(claim),
    ])
    expect(results).toEqual(
      expect.arrayContaining([null, expect.objectContaining({ id: claim.id })]),
    )

    const minute = 60_000
    const [current, future, otherBooking] = await Promise.all([
      hasNotificationSince(RECEPTION, claim.type, new Date(Date.now() - minute), booking.id),
      hasNotificationSince(RECEPTION, claim.type, new Date(Date.now() + minute), booking.id),
      hasNotificationSince(RECEPTION, claim.type, new Date(Date.now() - minute), 'another-booking'),
    ])
    expect([current, future, otherBooking]).toEqual([true, false, false])
  })
})

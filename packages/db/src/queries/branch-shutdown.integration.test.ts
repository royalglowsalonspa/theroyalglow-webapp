/************************************************************
 * Module Name  : branch-shutdown.integration.test
 * Scope        : Integration test — shutting a branch down (REAL db, R1.10)
 *
 * Description  : Against Neon dev, with the 0011 triggers:
 *                - the blockers list the Manager, staff, bookings still to
 *                  happen, unpaid invoices and open waitlist entries;
 *                - the shutdown is refused while any remain, by the query and
 *                  by the database for a direct write, with nothing written;
 *                - once resolved it succeeds and clears leftover schedule days;
 *                - a shut-down branch takes no new booking or invoice, while
 *                  its history stays editable;
 *                - only an empty shut-down branch can be deleted; an Owner of
 *                  no other branch becomes a Customer in the same transaction,
 *                  with sessions ended and a revocation queued.
 *
 * Skip behaviour : Skips without packages/db/.env (CI).
 *
 * Data hygiene : Prefixed `shut_it_<run>` rows with their own Owners, deleted
 *                in one transaction in afterAll, then zero residue is proven.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import { issuedInvoiceStatements } from '../test/issued-invoice'
import { isLiveDbAvailable, queryRow } from '../test/live-db'
import { createBookingWithServices } from './bookings'
import {
  deleteShutDownBranch,
  getBranchShutdownBlockers,
  isBranchShutDownError,
  shutDownBranch,
  shutdownIsClear,
} from './branch-shutdown'
import { createClosures } from './closures'

const LIVE = isLiveDbAvailable()
const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `shut_it_${RUN}`
const MAIN = `${PREFIX}_main`
const EXTRA = `${PREFIX}_extra`
const SOLO = `${PREFIX}_solo`
const OWNER_A = `${PREFIX}_owner_a`
const OWNER_B = `${PREFIX}_owner_b`
const MANAGER = `${PREFIX}_mgr`
const RECEPTION = `${PREFIX}_rcp`
const CUSTOMER = `${PREFIX}_cust`
// Invoice numbers are at most 16 characters.
const OPEN_INVOICE_NUMBER = `ZZ${RUN}S`

let serviceId = ''
let bookingId = ''

function bookAt(branchId: string, key: string) {
  return createBookingWithServices(
    {
      bookingNumber: `${PREFIX}_${key}`,
      branchId,
      customerId: CUSTOMER,
      status: 'pending',
      serviceType: 'salon',
      bookingDate: new Date('2099-05-01T00:00:00.000Z'),
      startTime: '10:00',
      endTime: '11:00',
      totalAmountPaise: 50_000,
      totalDurationMinutes: 60,
    },
    [
      {
        serviceId,
        staffId: null,
        serviceNameSnapshot: `ZZ IT ${key}`,
        priceAtBookingPaise: 50_000,
        durationMinutes: 60,
        displayOrder: 0,
      },
    ],
  )
}

/** Every message down the error's cause chain (Drizzle wraps the Postgres error). */
async function refusal(write: PromiseLike<unknown>): Promise<string> {
  try {
    await write
  } catch (error) {
    const messages: string[] = []
    let current: unknown = error
    for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
      messages.push(current.message)
      current = (current as { cause?: unknown }).cause
    }
    return messages.join(' | ')
  }
  return 'no error'
}

async function statusOf(branchId: string) {
  return (await queryRow<{ status: string }>(sql`select status from branch where id = ${branchId}`))
    ?.status
}

describe.skipIf(!LIVE)('shutting a branch down against a live database', () => {
  beforeAll(async () => {
    const service = await queryRow<{ id: string }>(
      sql`select id from service where is_active = true order by id limit 1`,
    )
    serviceId = service?.id ?? ''
    const number = 9500 + Math.floor(Math.random() * 90)

    // One transaction: the deferred role checks see every relationship at commit.
    await db.batch([
      db.execute(sql`
        insert into "user" (id, name, email, email_verified, role)
        values (${OWNER_A}, 'ZZ Shut IT Owner A', ${`${OWNER_A}@example.invalid`}, false, 'owner'),
               (${OWNER_B}, 'ZZ Shut IT Owner B', ${`${OWNER_B}@example.invalid`}, false, 'owner'),
               (${MANAGER}, 'ZZ Shut IT Manager', ${`${MANAGER}@example.invalid`}, false, 'manager'),
               (${RECEPTION}, 'ZZ Shut IT Reception', ${`${RECEPTION}@example.invalid`}, false, 'receptionist'),
               (${CUSTOMER}, 'ZZ Shut IT Customer', ${`${CUSTOMER}@example.invalid`}, false, 'customer')`),
      db.execute(sql`
        insert into branch (id, number, code, name, address_line1, pincode, phone, display_order,
                            owner_user_id, manager_user_id)
        values (${MAIN}, ${number}, ${`${PREFIX}_M`}, 'ZZ Shut IT Main', 'Test', '560100', '0000000000', 993, ${OWNER_A}, ${MANAGER}),
               (${EXTRA}, ${number + 1}, ${`${PREFIX}_X`}, 'ZZ Shut IT Extra', 'Test', '560100', '0000000000', 994, ${OWNER_A}, null),
               (${SOLO}, ${number + 2}, ${`${PREFIX}_S`}, 'ZZ Shut IT Solo', 'Test', '560100', '0000000000', 995, ${OWNER_B}, null)`),
      db.execute(sql`
        insert into staff_profile (id, user_id, designation, is_active, branch_id, role_witness)
        values (${`${MANAGER}_p`}, ${MANAGER}, 'manager', true, null, 'manager'),
               (${`${RECEPTION}_p`}, ${RECEPTION}, 'receptionist', true, ${MAIN}, 'receptionist')`),
      db.execute(sql`
        insert into staff_schedule (id, staff_id, day_of_week, is_working, start_time, end_time, branch_id)
        values (${`${PREFIX}_s1`}, ${`${RECEPTION}_p`}, 1, true, '10:00', '18:00', ${MAIN}),
               (${`${PREFIX}_s2`}, ${`${MANAGER}_p`}, 2, true, '10:00', '18:00', ${MAIN})`),
      db.execute(sql`
        insert into session (id, user_id, expires_at, token)
        values (${`${PREFIX}_sess`}, ${OWNER_B}, now() + interval '1 day', ${`${PREFIX}_token`})`),
    ])

    bookingId = (await bookAt(MAIN, 'open')).id
    await db.batch([
      ...(await issuedInvoiceStatements({
        id: `${PREFIX}_inv`,
        number: OPEN_INVOICE_NUMBER,
        sequence: 1,
        branchId: MAIN,
        customerId: CUSTOMER,
        bookingId,
        paymentStatus: 'pending',
        taxPointAt: new Date(),
        lines: [{ name: 'ZZ IT open', amountPaise: 50_000 }],
      })),
      db.execute(sql`
        insert into waitlist (id, customer_id, service_id, preferred_date, status, branch_id)
        values (${`${PREFIX}_wl`}, ${CUSTOMER}, ${serviceId}, '2099-05-02', 'waiting', ${MAIN})`),
    ])
  })

  afterAll(async () => {
    const like = `${PREFIX}%`
    await db.batch([
      db.execute(sql`delete from invoice where id like ${like}`),
      db.execute(
        sql`delete from booking_status_log where booking_id in (select id from booking where booking_number like ${like})`,
      ),
      db.execute(
        sql`delete from booking_service where booking_id in (select id from booking where booking_number like ${like})`,
      ),
      db.execute(sql`delete from booking where booking_number like ${like}`),
      db.execute(sql`delete from waitlist where id like ${like}`),
      db.execute(sql`delete from staff_schedule where id like ${like}`),
      db.execute(sql`delete from staff_profile where user_id like ${like}`),
      db.execute(sql`delete from holiday where branch_id like ${like}`),
      db.execute(sql`delete from branch where id like ${like}`),
      db.execute(sql`delete from "user" where id like ${like}`),
    ])
    expect(
      await queryRow(sql`
        select (select count(*) from booking where booking_number like ${like}) as bookings,
               (select count(*) from invoice where id like ${like}) as invoices,
               (select count(*) from waitlist where id like ${like}) as waitlist,
               (select count(*) from staff_schedule where id like ${like}) as schedule,
               (select count(*) from branch where id like ${like}) as branches,
               (select count(*) from realtime_revocation where user_id like ${like}) as revocations,
               (select count(*) from session where user_id like ${like}) as sessions,
               (select count(*) from "user" where id like ${like}) as users`),
    ).toEqual({
      bookings: '0',
      invoices: '0',
      waitlist: '0',
      schedule: '0',
      branches: '0',
      revocations: '0',
      sessions: '0',
      users: '0',
    })
  })

  it('lists everything still open at the branch', async () => {
    const blockers = await getBranchShutdownBlockers(MAIN)
    expect(blockers?.manager).toEqual({ userId: MANAGER, name: 'ZZ Shut IT Manager' })
    expect(blockers?.people).toEqual([
      { userId: RECEPTION, name: 'ZZ Shut IT Reception', role: 'receptionist' },
    ])
    expect(blockers?.bookings.count).toBe(1)
    expect(blockers?.bookings.upcoming[0]).toMatchObject({
      id: bookingId,
      date: '2099-05-01',
      startTime: '10:00',
      status: 'pending',
      customerName: 'ZZ Shut IT Customer',
    })
    expect(blockers?.unpaidInvoices).toEqual({
      count: 1,
      listed: [{ id: `${PREFIX}_inv`, invoiceNumber: OPEN_INVOICE_NUMBER }],
    })
    expect(blockers?.waitlist.count).toBe(1)
    expect(blockers && shutdownIsClear(blockers)).toBe(false)

    expect(await getBranchShutdownBlockers(`${PREFIX}_nowhere`)).toBeNull()
  })

  it('refuses the shutdown while anything is open, and writes nothing', async () => {
    expect(await shutDownBranch(MAIN, { temporaryCloseReason: 'Closing' })).toEqual({
      ok: false,
      reason: 'unresolved',
    })
    expect(await statusOf(MAIN)).toBe('operational')
    // The schedule clean-up rolled back with it.
    expect(
      await queryRow(
        sql`select count(*) as n from staff_schedule where branch_id = ${MAIN} and is_working`,
      ),
    ).toEqual({ n: '2' })

    // A direct write is refused by the database too.
    expect(
      await refusal(db.execute(sql`update branch set status = 'shutdown' where id = ${MAIN}`)),
    ).toMatch(/still has people, bookings or payments/)
  })

  it('shuts down once everything is resolved, clearing leftover schedule days', async () => {
    // Resolve: the booking cancelled, the invoice paid, the waitlist entry
    // cancelled; the Manager and Receptionist removed in one transaction.
    await db.batch([
      db.execute(sql`update booking set status = 'cancelled' where id = ${bookingId}`),
      db.execute(sql`update invoice set payment_status = 'paid' where id = ${`${PREFIX}_inv`}`),
      db.execute(sql`update waitlist set status = 'cancelled' where id = ${`${PREFIX}_wl`}`),
      db.execute(sql`update branch set manager_user_id = null where id = ${MAIN}`),
      db.execute(sql`update staff_profile set is_active = false, role_witness = null
        where user_id in (${MANAGER}, ${RECEPTION})`),
      db.execute(sql`update "user" set role = 'customer' where id in (${MANAGER}, ${RECEPTION})`),
    ])
    const blockers = await getBranchShutdownBlockers(MAIN)
    expect(blockers && shutdownIsClear(blockers)).toBe(true)

    const result = await shutDownBranch(MAIN, { temporaryCloseReason: 'Lease ended' })
    expect(result.ok).toBe(true)
    expect(result.ok && result.branch.status).toBe('shutdown')
    expect(result.ok && result.branch.temporaryCloseReason).toBe('Lease ended')
    expect(
      await queryRow(sql`select count(*) as n from staff_schedule where branch_id = ${MAIN}`),
    ).toEqual({ n: '0' })
  })

  it('takes no new booking or invoice once shut down, but keeps history editable', async () => {
    let bookingError: unknown = null
    try {
      await bookAt(MAIN, 'late')
    } catch (error) {
      bookingError = error
    }
    expect(isBranchShutDownError(bookingError)).toBe(true)

    // A complete, snapshotted invoice, so only the shutdown guard refuses it.
    const [lateInvoice] = await issuedInvoiceStatements({
      id: `${PREFIX}_inv_late`,
      number: `ZZ${RUN}LATE`,
      sequence: 2,
      branchId: MAIN,
      customerId: CUSTOMER,
      paymentStatus: 'pending',
      taxPointAt: new Date(),
      lines: [],
    })
    expect(await refusal(lateInvoice)).toMatch(/is shut down/)

    // A booking can't move to the shut-down branch either.
    const elsewhere = (await bookAt(EXTRA, 'elsewhere')).id
    expect(
      await refusal(
        db.execute(sql`update booking set branch_id = ${MAIN} where id = ${elsewhere}`),
      ),
    ).toMatch(/is shut down/)

    // Existing records stay editable.
    await db.execute(sql`update booking set notes = 'archived' where id = ${bookingId}`)
    expect(await queryRow(sql`select notes from booking where id = ${bookingId}`)).toEqual({
      notes: 'archived',
    })
  })

  it('keeps a shut-down branch that still has records', async () => {
    expect(await deleteShutDownBranch(MAIN)).toEqual({ ok: false, reason: 'not_empty' })
    expect(await statusOf(MAIN)).toBe('shutdown')
  })

  it('deletes only a shut-down branch; an Owner with another branch stays an Owner', async () => {
    // EXTRA has a booking from the previous case: cancel it, then move it away
    // is impossible (MAIN is shut), so delete it to empty the branch.
    await db.batch([
      db.execute(
        sql`delete from booking_service where booking_id in (select id from booking where booking_number = ${`${PREFIX}_elsewhere`})`,
      ),
      db.execute(sql`delete from booking where booking_number = ${`${PREFIX}_elsewhere`}`),
    ])
    expect(await deleteShutDownBranch(EXTRA)).toEqual({ ok: false, reason: 'not_shut_down' })

    expect((await shutDownBranch(EXTRA, {})).ok).toBe(true)
    expect(await deleteShutDownBranch(EXTRA)).toEqual({ ok: true, demotedOwnerId: null })
    expect(await statusOf(EXTRA)).toBeUndefined()
    expect(await queryRow(sql`select role from "user" where id = ${OWNER_A}`)).toEqual({
      role: 'owner',
    })
  })

  it('returns an Owner of no other branch to Customer, ending sessions and queueing revocation', async () => {
    await createClosures({ branchId: SOLO, dates: ['2099-05-03'], name: `${PREFIX} closure` })
    expect((await shutDownBranch(SOLO, {})).ok).toBe(true)

    expect(await deleteShutDownBranch(SOLO)).toEqual({ ok: true, demotedOwnerId: OWNER_B })
    expect(
      await queryRow(sql`
        select (select role from "user" where id = ${OWNER_B}) as role,
               (select count(*) from session where user_id = ${OWNER_B}) as sessions,
               (select count(*) from realtime_revocation
                 where user_id = ${OWNER_B} and resolved_at is null) as pending_revocations,
               (select count(*) from holiday where branch_id = ${SOLO}) as closures`),
    ).toEqual({ role: 'customer', sessions: '0', pending_revocations: '1', closures: '0' })

    expect(await deleteShutDownBranch(SOLO)).toEqual({ ok: false, reason: 'not_found' })
  })
})

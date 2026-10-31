/************************************************************
 * Module Name  : customers.integration.test
 * Scope        : Integration test — shared customers, per-branch money (REAL db)
 *
 * Description  : The admin customer reads against Neon dev with three
 *                throwaway branches A, B and C (multi-branch R3):
 *                  - the directory lists every customer at every branch, but
 *                    LTV and the LTV sort count only that branch's paid
 *                    invoices;
 *                  - a profile's spend and visits, bookings and invoices come
 *                    from the branch; other branches' visits carry only their
 *                    date, branch and services;
 *                  - a branch reads every shared note and its own private
 *                    notes, never another branch's private note;
 *                  - C, with no history of its own, learns nothing of A's or
 *                    B's money (a third Owner can't infer it).
 *
 * Skip behaviour : Skips without packages/db/.env (CI). Run it locally with
 *                `bun run test:integration`.
 *
 * Data hygiene : Prefixed `cust_it_<run>` rows, deleted in one transaction in
 *                afterAll, then zero residue is proven. The branches reuse the
 *                primary branch's Owner.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import { issuedInvoiceStatements } from '../test/issued-invoice'
import { isLiveDbAvailable, queryRow } from '../test/live-db'
import { createBookingWithServices } from './bookings'
import {
  addCustomerNote,
  getCustomerBranchSpend,
  getCustomerHistory,
  getCustomerInvoices,
  getCustomerNotes,
  getCustomerProfile,
  getCustomers,
  isCustomerBookingAtBranch,
} from './customers'

const LIVE = isLiveDbAvailable()
// Letters only: the directory search below uses the prefix, and three or more
// digits in a search term also match phone numbers (person-search.ts), which
// let a real customer's phone into the results.
const RUN = Array.from({ length: 6 }, () =>
  String.fromCharCode(97 + Math.floor(Math.random() * 26)),
).join('')
const PREFIX = `cust_it_${RUN}`
const BRANCH_A = `${PREFIX}_a`
const BRANCH_B = `${PREFIX}_b`
const BRANCH_C = `${PREFIX}_c`
const ASHA = `${PREFIX}_asha`
const RAVI = `${PREFIX}_ravi`
const AUTHOR = `${PREFIX}_author`

let serviceId = ''
const bookings: Record<string, string> = {}

async function book(
  key: string,
  branchId: string,
  customerId: string,
  status: 'completed' | 'cancelled' | 'pending',
  day: string,
  startTime: string,
  totalAmountPaise: number,
) {
  const created = await createBookingWithServices(
    {
      bookingNumber: `${PREFIX}_${key}`,
      branchId,
      customerId,
      status,
      serviceType: 'salon',
      bookingDate: new Date(`${day}T00:00:00.000Z`),
      startTime,
      endTime: '23:00',
      totalAmountPaise,
      totalDurationMinutes: 30,
    },
    [
      {
        serviceId,
        staffId: null,
        serviceNameSnapshot: `ZZ IT service ${key}`,
        priceAtBookingPaise: totalAmountPaise,
        durationMinutes: 30,
        displayOrder: 0,
      },
    ],
  )
  bookings[key] = created.id
}

describe.skipIf(!LIVE)('shared customers with per-branch money against a live database', () => {
  beforeAll(async () => {
    const owner = await queryRow<{ id: string }>(
      sql`select owner_user_id as id from branch order by is_primary desc, display_order limit 1`,
    )
    const service = await queryRow<{ id: string }>(
      sql`select id from service where is_active = true order by id limit 1`,
    )
    serviceId = service?.id ?? ''
    const number = 9800 + Math.floor(Math.random() * 90)

    await db.batch([
      db.execute(sql`
        insert into "user" (id, name, email, email_verified, role)
        values (${ASHA}, 'ZZ Cust IT Asha', ${`${ASHA}@example.invalid`}, false, 'customer'),
               (${RAVI}, 'ZZ Cust IT Ravi', ${`${RAVI}@example.invalid`}, false, 'customer'),
               (${AUTHOR}, 'ZZ Cust IT author', ${`${AUTHOR}@example.invalid`}, false, 'customer')`),
      db.execute(sql`
        insert into customer_profile (id, user_id, total_visits, total_spent_paise)
        values (${`${ASHA}_p`}, ${ASHA}, 2, 170000),
               (${`${RAVI}_p`}, ${RAVI}, 1, 300000)`),
      db.execute(sql`
        insert into branch (id, number, code, name, address_line1, pincode, phone, display_order, owner_user_id)
        values (${BRANCH_A}, ${number}, ${`${PREFIX}_A`}, 'ZZ Cust IT A', 'Test', '560100', '0000000000', 970, ${owner?.id ?? ''}),
               (${BRANCH_B}, ${number + 1}, ${`${PREFIX}_B`}, 'ZZ Cust IT B', 'Test', '560100', '0000000000', 971, ${owner?.id ?? ''}),
               (${BRANCH_C}, ${number + 2}, ${`${PREFIX}_C`}, 'ZZ Cust IT C', 'Test', '560100', '0000000000', 972, ${owner?.id ?? ''})`),
    ])

    // Asha: a visit and a cancellation at A; a visit and a pending booking at B.
    // Ravi: one big visit at B.
    await book('a_visit', BRANCH_A, ASHA, 'completed', '2099-01-02', '10:00', 50_000)
    await book('a_cancelled', BRANCH_A, ASHA, 'cancelled', '2099-01-05', '11:00', 20_000)
    await book('b_visit', BRANCH_B, ASHA, 'completed', '2099-01-03', '12:00', 120_000)
    await book('b_pending', BRANCH_B, ASHA, 'pending', '2099-01-04', '09:00', 80_000)
    await book('b_ravi', BRANCH_B, RAVI, 'completed', '2099-01-06', '15:00', 300_000)

    // Issued invoices with their snapshot (0018); numbers are at most 16 characters.
    const issue = (p: {
      key: string
      booking: string
      branchId: string
      customerId: string
      sequence: number
      amountPaise: number
      paid: boolean
      at: string
    }) =>
      issuedInvoiceStatements({
        id: `${PREFIX}_inv_${p.key}`,
        number: `ZZ${RUN}${p.key.slice(0, 6)}`,
        sequence: p.sequence,
        branchId: p.branchId,
        customerId: p.customerId,
        bookingId: bookings[p.booking] ?? null,
        paymentStatus: p.paid ? 'paid' : 'pending',
        taxPointAt: new Date(p.at),
        lines: [{ name: `ZZ IT service ${p.booking}`, amountPaise: p.amountPaise }],
      })
    const [first, ...rest] = await Promise.all([
      issue({
        key: 'a',
        booking: 'a_visit',
        branchId: BRANCH_A,
        customerId: ASHA,
        sequence: 1,
        amountPaise: 50_000,
        paid: true,
        at: '2099-01-02T06:00:00Z',
      }),
      issue({
        key: 'a_unpaid',
        booking: 'a_cancelled',
        branchId: BRANCH_A,
        customerId: ASHA,
        sequence: 2,
        amountPaise: 7_000,
        paid: false,
        at: '2099-01-05T06:00:00Z',
      }),
      issue({
        key: 'b',
        booking: 'b_visit',
        branchId: BRANCH_B,
        customerId: ASHA,
        sequence: 1,
        amountPaise: 120_000,
        paid: true,
        at: '2099-01-03T06:00:00Z',
      }),
      issue({
        key: 'ravi',
        booking: 'b_ravi',
        branchId: BRANCH_B,
        customerId: RAVI,
        sequence: 2,
        amountPaise: 300_000,
        paid: true,
        at: '2099-01-06T06:00:00Z',
      }),
    ]).then((sets) => sets.flat())
    if (!first) {
      throw new Error('no invoice statements')
    }
    await db.batch([first, ...rest])

    const note = (branchId: string, visibility: 'shared' | 'branch', content: string) =>
      addCustomerNote({ customerId: ASHA, authorId: AUTHOR, branchId, visibility, content })
    await note(BRANCH_A, 'branch', `${PREFIX} A private`)
    await note(BRANCH_A, 'shared', `${PREFIX} A shared`)
    await note(BRANCH_B, 'branch', `${PREFIX} B private`)
  })

  afterAll(async () => {
    const like = `${PREFIX}%`
    await db.batch([
      db.execute(sql`delete from customer_note where customer_id like ${like}`),
      db.execute(sql`delete from invoice where id like ${like}`),
      db.execute(
        sql`delete from booking_status_log where booking_id in (select id from booking where booking_number like ${like})`,
      ),
      db.execute(
        sql`delete from booking_service where booking_id in (select id from booking where booking_number like ${like})`,
      ),
      db.execute(sql`delete from booking where booking_number like ${like}`),
      db.execute(sql`delete from customer_profile where user_id like ${like}`),
      db.execute(sql`delete from branch where id like ${like}`),
      db.execute(sql`delete from "user" where id like ${like}`),
    ])
    expect(
      await queryRow(sql`
        select (select count(*) from booking where booking_number like ${like}) as bookings,
               (select count(*) from invoice where id like ${like}) as invoices,
               (select count(*) from customer_note where customer_id like ${like}) as notes,
               (select count(*) from branch where id like ${like}) as branches,
               (select count(*) from "user" where id like ${like}) as users`),
    ).toEqual({ bookings: '0', invoices: '0', notes: '0', branches: '0', users: '0' })
  })

  const directory = (branchId: string) =>
    getCustomers(branchId, { q: PREFIX, sort: 'ltv', page: 1, pageSize: 20 })

  it('lists every customer at every branch, with LTV from that branch’s paid invoices', async () => {
    const atA = await directory(BRANCH_A)
    const atB = await directory(BRANCH_B)
    const atC = await directory(BRANCH_C)

    expect(atA.rows.map((r) => [r.id, r.branchSpentPaise])).toEqual([
      [ASHA, 50_000],
      [RAVI, 0],
    ])
    expect(atB.rows.map((r) => [r.id, r.branchSpentPaise])).toEqual([
      [RAVI, 300_000],
      [ASHA, 120_000],
    ])
    // C has taken no money: every LTV is zero, so the order reveals nothing.
    expect(atC.rows.map((r) => r.branchSpentPaise)).toEqual([0, 0])
    expect(atC.totalCount).toBe(2)
    for (const row of [...atA.rows, ...atB.rows, ...atC.rows]) {
      expect(row).not.toHaveProperty('totalSpentPaise')
    }
    // Visits are shared visit history.
    expect(atC.rows.find((r) => r.id === ASHA)?.totalVisits).toBe(2)
  })

  it('totals a customer’s spend and visits at one branch only', async () => {
    expect(await getCustomerBranchSpend(ASHA, BRANCH_A)).toEqual({ spentPaise: 50_000, visits: 1 })
    expect(await getCustomerBranchSpend(ASHA, BRANCH_B)).toEqual({
      spentPaise: 120_000,
      visits: 1,
    })
    expect(await getCustomerBranchSpend(ASHA, BRANCH_C)).toEqual({ spentPaise: 0, visits: 0 })
  })

  it('shows another branch’s visits as date, branch and services only', async () => {
    const atA = await getCustomerHistory(ASHA, BRANCH_A, 20)

    expect(atA.thisBranch.map((e) => e.scope === 'this_branch' && e.bookingId)).toEqual([
      bookings.a_cancelled,
      bookings.a_visit,
    ])
    expect(atA.thisBranch[1]).toMatchObject({
      status: 'completed',
      totalAmountPaise: 50_000,
      services: ['ZZ IT service a_visit'],
    })
    // B's pending booking is not a visit; its completed one has no money or id.
    expect(atA.otherBranches).toEqual([
      {
        scope: 'other_branch',
        branchName: 'ZZ Cust IT B',
        bookingDate: '2099-01-03',
        startTime: '12:00:00',
        serviceType: 'salon',
        services: ['ZZ IT service b_visit'],
      },
    ])

    const atC = await getCustomerHistory(ASHA, BRANCH_C, 20)
    expect(atC.thisBranch).toEqual([])
    expect(atC.otherBranches.map((e) => e.bookingDate)).toEqual(['2099-01-03', '2099-01-02'])
    for (const entry of atC.otherBranches) {
      expect(Object.keys(entry).sort()).toEqual(
        ['bookingDate', 'branchName', 'scope', 'serviceType', 'services', 'startTime'].sort(),
      )
    }
  })

  it('lists only the branch’s own invoices', async () => {
    expect((await getCustomerInvoices(ASHA, BRANCH_A, 20, 0)).map((i) => i.id)).toEqual([
      `${PREFIX}_inv_a_unpaid`,
      `${PREFIX}_inv_a`,
    ])
    expect((await getCustomerInvoices(ASHA, BRANCH_B, 20, 0)).map((i) => i.id)).toEqual([
      `${PREFIX}_inv_b`,
    ])
    expect(await getCustomerInvoices(ASHA, BRANCH_C, 20, 0)).toEqual([])
  })

  it('reads every shared note and only the branch’s own private notes', async () => {
    const contents = async (branchId: string) =>
      (await getCustomerNotes(ASHA, branchId)).map((n) => `${n.content}|${n.visibility}`).sort()

    expect(await contents(BRANCH_A)).toEqual(
      [`${PREFIX} A private|branch`, `${PREFIX} A shared|shared`].sort(),
    )
    expect(await contents(BRANCH_B)).toEqual(
      [`${PREFIX} A shared|shared`, `${PREFIX} B private|branch`].sort(),
    )
    expect(await contents(BRANCH_C)).toEqual([`${PREFIX} A shared|shared`])

    const [shared] = await getCustomerNotes(ASHA, BRANCH_C)
    expect(shared).toMatchObject({ branchName: 'ZZ Cust IT A', authorName: 'ZZ Cust IT author' })
  })

  it('links a note only to the customer’s booking at the branch', async () => {
    expect(await isCustomerBookingAtBranch(bookings.a_visit ?? '', ASHA, BRANCH_A)).toBe(true)
    expect(await isCustomerBookingAtBranch(bookings.b_visit ?? '', ASHA, BRANCH_A)).toBe(false)
    expect(await isCustomerBookingAtBranch(bookings.a_visit ?? '', RAVI, BRANCH_A)).toBe(false)
  })

  it('keeps the customer-wide spending counter out of the shared profile', async () => {
    const profile = await getCustomerProfile(ASHA)

    expect(profile).toMatchObject({ id: ASHA, totalVisits: 2 })
    expect(profile).not.toHaveProperty('totalSpentPaise')
  })
})

/************************************************************
 * Module Name  : closures.integration.test
 * Scope        : Integration test — branch closures (REAL db, multi-branch R1.8)
 *
 * Description  : Against Neon dev: a date is closed at most once per branch
 *                and once for every branch (partial unique indexes), so a
 *                retried add creates nothing twice; a branch's own closure
 *                names the day before an every-branch one; reads cover the
 *                branch and every-branch closures only; delete is
 *                compare-and-delete; the bookings a closure leaves to move
 *                are scoped to the branch; closures go with a deleted branch.
 *
 * Skip behaviour : Skips without packages/db/.env (CI).
 *
 * Data hygiene : Prefixed `clo_it_<run>` rows on dates in 2099, deleted in one
 *                transaction in afterAll, then zero residue is proven. The
 *                fixture branches reuse the real Owner (the Owner key needs an
 *                account that holds the role).
 ************************************************************/

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import { isLiveDbAvailable, queryRow } from '../test/live-db'
import { createBookingWithServices } from './bookings'
import {
  createClosures,
  deleteClosure,
  getActiveBookingsOnDates,
  getBranchClosures,
  getClosureById,
  getClosureOn,
} from './closures'

const LIVE = isLiveDbAvailable()
const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `clo_it_${RUN}`
const BRANCH_A = `${PREFIX}_a`
const BRANCH_B = `${PREFIX}_b`
const BRANCH_GONE = `${PREFIX}_gone`
const ASHA = `${PREFIX}_asha`
// Every-branch closures carry the prefix in their name so cleanup finds them.
const ALL_NAME = `${PREFIX} every branch`

// Far-future dates this suite owns. Every-branch closures on them also apply
// to the real branches, harmlessly, until afterAll removes them.
const D1 = '2099-04-01'
const D2 = '2099-04-02'
const D3 = '2099-04-03'

let serviceId = ''

describe.skipIf(!LIVE)('branch closures against a live database', () => {
  beforeAll(async () => {
    const owner = await queryRow<{ id: string }>(
      sql`select owner_user_id as id from branch order by is_primary desc, display_order limit 1`,
    )
    const service = await queryRow<{ id: string }>(
      sql`select id from service where is_active = true order by id limit 1`,
    )
    serviceId = service?.id ?? ''
    const number = 9600 + Math.floor(Math.random() * 90)

    await db.batch([
      db.execute(sql`
        insert into "user" (id, name, email, email_verified, role)
        values (${ASHA}, 'ZZ Clo IT Asha', ${`${ASHA}@example.invalid`}, false, 'customer')`),
      db.execute(sql`
        insert into branch (id, number, code, name, address_line1, pincode, phone, display_order, owner_user_id)
        values (${BRANCH_A}, ${number}, ${`${PREFIX}_A`}, 'ZZ Clo IT A', 'Test', '560100', '0000000000', 990, ${owner?.id ?? ''}),
               (${BRANCH_B}, ${number + 1}, ${`${PREFIX}_B`}, 'ZZ Clo IT B', 'Test', '560100', '0000000000', 991, ${owner?.id ?? ''}),
               (${BRANCH_GONE}, ${number + 2}, ${`${PREFIX}_G`}, 'ZZ Clo IT gone', 'Test', '560100', '0000000000', 992, ${owner?.id ?? ''})`),
    ])

    // A confirmed booking at A on D2, a cancelled one at A on D2, and a
    // pending one at B on D2.
    const book = (key: string, branchId: string, status: 'confirmed' | 'cancelled' | 'pending') =>
      createBookingWithServices(
        {
          bookingNumber: `${PREFIX}_${key}`,
          branchId,
          customerId: ASHA,
          status,
          serviceType: 'salon',
          bookingDate: new Date(`${D2}T00:00:00.000Z`),
          startTime: key === 'a_live' ? '11:00' : '10:00',
          endTime: '12:00',
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
    await book('a_live', BRANCH_A, 'confirmed')
    await book('a_cancelled', BRANCH_A, 'cancelled')
    await book('b_live', BRANCH_B, 'pending')
  })

  afterAll(async () => {
    const like = `${PREFIX}%`
    await db.batch([
      db.execute(sql`delete from holiday where name like ${like} or branch_id like ${like}`),
      db.execute(
        sql`delete from booking_service where booking_id in (select id from booking where booking_number like ${like})`,
      ),
      db.execute(sql`delete from booking where booking_number like ${like}`),
      db.execute(sql`delete from branch where id like ${like}`),
      db.execute(sql`delete from "user" where id like ${like}`),
    ])
    expect(
      await queryRow(sql`
        select (select count(*) from holiday where name like ${like} or branch_id like ${like}) as closures,
               (select count(*) from booking where booking_number like ${like}) as bookings,
               (select count(*) from branch where id like ${like}) as branches,
               (select count(*) from "user" where id like ${like}) as users`),
    ).toEqual({ closures: '0', bookings: '0', branches: '0', users: '0' })
  })

  it('closes each date once per branch: a retried add creates nothing twice', async () => {
    const first = await createClosures({ branchId: BRANCH_A, dates: [D2, D1], name: `${PREFIX} A` })
    expect(first.created.map((r) => r.date)).toEqual([D1, D2])
    expect(first.alreadyClosed).toEqual([])
    expect(first.created.every((r) => r.branchId === BRANCH_A)).toBe(true)

    const again = await createClosures({
      branchId: BRANCH_A,
      dates: [D1, D2, D3, D3],
      name: `${PREFIX} A again`,
    })
    expect(again.created.map((r) => r.date)).toEqual([D3])
    expect(again.alreadyClosed).toEqual([D1, D2])

    // The same dates at another branch are separate closures.
    const atB = await createClosures({ branchId: BRANCH_B, dates: [D1], name: `${PREFIX} B` })
    expect(atB.created).toHaveLength(1)

    expect(await createClosures({ branchId: BRANCH_B, dates: [], name: 'x' })).toEqual({
      created: [],
      alreadyClosed: [],
    })
  })

  it('closes each date once for every branch, beside the branch closures', async () => {
    const first = await createClosures({ branchId: null, dates: [D1], name: ALL_NAME })
    expect(first.created).toHaveLength(1)
    expect(first.created[0]?.branchId).toBeNull()

    const again = await createClosures({ branchId: null, dates: [D1], name: ALL_NAME })
    expect(again).toEqual({ created: [], alreadyClosed: [D1] })

    // The database refuses a duplicate written directly, too.
    await expect(
      db.execute(sql`insert into holiday (id, branch_id, date, name)
        values (${`${PREFIX}_dup`}, null, ${D1}, ${ALL_NAME})`),
    ).rejects.toThrow()
  })

  it("names a day by the branch's own closure first, then the every-branch one", async () => {
    expect(await getClosureOn(BRANCH_A, D1)).toEqual({ name: `${PREFIX} A`, allBranches: false })
    // B has its own closure on D1 too.
    expect(await getClosureOn(BRANCH_B, D1)).toEqual({ name: `${PREFIX} B`, allBranches: false })
    // A brand-new branch is closed on D1 only by the every-branch closure.
    expect(await getClosureOn(BRANCH_GONE, D1)).toEqual({ name: ALL_NAME, allBranches: true })
    expect(await getClosureOn(BRANCH_GONE, D2)).toBeNull()
  })

  it("reads a branch's closures and every-branch closures only, by date", async () => {
    const atA = await getBranchClosures(BRANCH_A, D1, D3)
    expect(atA.map((r) => [r.date, r.branchId])).toEqual([
      [D1, null],
      [D1, BRANCH_A],
      [D2, BRANCH_A],
      [D3, BRANCH_A],
    ])
    // B's closure never shows at A.
    expect(atA.some((r) => r.branchId === BRANCH_B)).toBe(false)

    expect((await getBranchClosures(BRANCH_A, D2, D2)).map((r) => r.date)).toEqual([D2])
    expect((await getBranchClosures(BRANCH_A, D3)).map((r) => r.date)).toEqual([D3])
  })

  it('lists the bookings a closure leaves to move, at the branch or everywhere', async () => {
    const atA = await getActiveBookingsOnDates([D2], BRANCH_A)
    expect(atA).toEqual([
      expect.objectContaining({
        bookingNumber: `${PREFIX}_a_live`,
        branchName: 'ZZ Clo IT A',
        date: D2,
        startTime: '11:00',
        status: 'confirmed',
        customerName: 'ZZ Clo IT Asha',
      }),
    ])

    const everywhere = await getActiveBookingsOnDates([D2], null)
    const mine = everywhere.filter((b) => b.bookingNumber.startsWith(PREFIX))
    expect(mine.map((b) => b.bookingNumber).sort()).toEqual([
      `${PREFIX}_a_live`,
      `${PREFIX}_b_live`,
    ])
    expect(await getActiveBookingsOnDates([], BRANCH_A)).toEqual([])
  })

  it('deletes only while the closure still belongs where it was read', async () => {
    const [d3] = await getBranchClosures(BRANCH_A, D3, D3)
    const id = d3?.id ?? ''

    // Read as B's: nothing happens.
    expect(await deleteClosure({ id, branchId: BRANCH_B })).toBeNull()
    expect(await deleteClosure({ id, branchId: null })).toBeNull()
    expect(await getClosureById(id)).not.toBeNull()

    expect((await deleteClosure({ id, branchId: BRANCH_A }))?.date).toBe(D3)
    expect(await getClosureById(id)).toBeNull()
    // A second delete finds nothing.
    expect(await deleteClosure({ id, branchId: BRANCH_A })).toBeNull()
  })

  it("removes a branch's closures with the branch", async () => {
    await createClosures({ branchId: BRANCH_GONE, dates: [D2, D3], name: `${PREFIX} gone` })
    await db.execute(sql`delete from branch where id = ${BRANCH_GONE}`)

    expect(
      await queryRow(sql`select count(*) as n from holiday where branch_id = ${BRANCH_GONE}`),
    ).toEqual({ n: '0' })
    // The every-branch closure stays.
    expect(await getClosureOn(BRANCH_A, D1)).not.toBeNull()
  })
})

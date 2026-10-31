/************************************************************
 * Module Name  : catalogue-availability.integration.test
 * Scope        : Integration test — branch availability of the catalogue
 *                (REAL db, multi-branch R4.2–R4.4, migrations 0033–0034)
 *
 * Description  : Against Neon dev:
 *                - `service_available_at` offers a service at a branch only
 *                  when its own and its category's availability include it,
 *                  and "all branches" includes a branch added later;
 *                - the catalogue reads report each service's branches;
 *                - a new booking line for a service its booking's branch
 *                  doesn't offer is refused, as is changing a line to one,
 *                  while existing lines keep their service (R4.4);
 *                - the dashboard lists the branch's bookings still to come
 *                  with a service it no longer offers.
 *
 * Skip behaviour : Skips without packages/db/.env (CI).
 *
 * Data hygiene : Prefixed `cav_it_<run>` rows (two test branches, a category,
 *                services, users, bookings dated 2099), deleted in one
 *                transaction in afterAll, then zero residue is proven.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import { booking, bookingService } from '../schema/booking'
import { isLiveDbAvailable, queryRow } from '../test/live-db'
import {
  BRANCH_AVAILABILITY_CONSTRAINT,
  getBookingsWithServicesNotOffered,
} from './catalogue-availability'
import { findDriverError, SQLSTATE } from './driver-errors'
import { getRedeemableServices } from './loyalty'
import { getRedeemableServiceById } from './redemptions'
import { getActiveCatalogue, getAllServicesGrouped, getServicesByIds } from './services'

const LIVE = isLiveDbAvailable()
const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `cav_it_${RUN}`
const BRANCH_A = `${PREFIX}_a`
const BRANCH_B = `${PREFIX}_b`
const BRANCH_C = `${PREFIX}_c`
const OWNER = `${PREFIX}_owner`
const MANAGER = `${PREFIX}_mgr`
const MANAGER_P = `${MANAGER}_p`
const CUSTOMER = `${PREFIX}_cust`
const CATEGORY = `${PREFIX}_cat`
// Every branch; only B; the category's branches (A and B) narrowed to A.
const SVC_ALL = `${PREFIX}_svc_all`
const SVC_B = `${PREFIX}_svc_b`
const SVC_A = `${PREFIX}_svc_a`

const TIMEOUT = { timeout: 60_000 }

function available(serviceId: string, branchId: string) {
  return queryRow<{ ok: boolean }>(
    sql`select service_available_at(${serviceId}, ${branchId}) as ok`,
  ).then((row) => row?.ok)
}

/** A pending booking at `branchId` with one unassigned line per service. */
async function book(
  key: string,
  branchId: string,
  serviceIds: readonly string[],
  date = '2099-03-02',
) {
  const id = `${PREFIX}_${key}`
  await db.batch([
    db.insert(booking).values({
      id,
      bookingNumber: id,
      branchId,
      customerId: CUSTOMER,
      status: 'pending',
      serviceType: 'salon',
      bookingDate: new Date(`${date}T00:00:00.000Z`),
      startTime: '11:00',
      endTime: '12:00',
      totalAmountPaise: 50_000 * serviceIds.length,
      totalDurationMinutes: 60,
    }),
    db.insert(bookingService).values(
      serviceIds.map((serviceId, index) => ({
        id: `${id}_l${index}`,
        bookingId: id,
        serviceId,
        staffId: null,
        serviceNameSnapshot: `ZZ Cav IT ${serviceId.slice(PREFIX.length + 1)}`,
        priceAtBookingPaise: 50_000,
        durationMinutes: 60,
        displayOrder: index,
      })),
    ),
  ])
  return id
}

/** `SQLSTATE constraint` the database refused `write` with, or 'written'. */
async function refusedBy(write: Promise<unknown>): Promise<string> {
  try {
    await write
  } catch (error) {
    const found = findDriverError(error, [SQLSTATE.checkViolation])
    if (found) {
      return `${String(found.code)} ${String(found.constraint)}`
    }
    throw error
  }
  return 'written'
}

/** Restrict a service (or every branch again with `null`). */
async function restrictService(serviceId: string, branchIds: readonly string[] | null) {
  await db.batch([
    db.execute(sql`delete from service_branch where service_id = ${serviceId}`),
    db.execute(
      sql`update service set all_branches = ${branchIds === null} where id = ${serviceId}`,
    ),
    ...(branchIds ?? []).map((branchId) =>
      db.execute(
        sql`insert into service_branch (service_id, branch_id) values (${serviceId}, ${branchId})`,
      ),
    ),
  ])
}

describe.skipIf(!LIVE)('catalogue branch availability against a live database', () => {
  beforeAll(async () => {
    const number = 9300 + Math.floor(Math.random() * 90)
    // One transaction: the deferred role checks see every relationship at commit.
    await db.batch([
      db.execute(sql`
        insert into "user" (id, name, email, email_verified, role)
        values (${OWNER}, 'ZZ Cav IT Owner', ${`${OWNER}@example.invalid`}, false, 'owner'),
               (${MANAGER}, 'ZZ Cav IT Manager', ${`${MANAGER}@example.invalid`}, false, 'manager'),
               (${CUSTOMER}, 'ZZ Cav IT Customer', ${`${CUSTOMER}@example.invalid`}, false, 'customer')`),
      db.execute(sql`
        insert into branch (id, number, code, name, address_line1, pincode, phone, display_order,
                            owner_user_id, manager_user_id)
        values (${BRANCH_A}, ${number}, ${`${PREFIX}_A`}, 'ZZ Cav IT A', 'Test', '560100', '0000000000', 990, ${OWNER}, ${MANAGER}),
               (${BRANCH_B}, ${number + 1}, ${`${PREFIX}_B`}, 'ZZ Cav IT B', 'Test', '560100', '0000000000', 991, ${OWNER}, ${MANAGER})`),
      db.execute(sql`
        insert into staff_profile (id, user_id, designation, is_active, branch_id, role_witness)
        values (${MANAGER_P}, ${MANAGER}, 'manager', true, null, 'manager')`),
      // The category is offered at A and B only; its services narrow that.
      db.execute(sql`
        insert into service_category (id, name, slug, service_type, sac_code, all_branches, display_order)
        values (${CATEGORY}, 'ZZ Cav IT', ${CATEGORY}, 'salon', '999721', false, 990)`),
      db.execute(sql`
        insert into service_category_branch (category_id, branch_id)
        values (${CATEGORY}, ${BRANCH_A}), (${CATEGORY}, ${BRANCH_B})`),
      db.execute(sql`
        insert into service (id, category_id, name, slug, duration_minutes, price_paise, all_branches, display_order)
        values (${SVC_ALL}, ${CATEGORY}, 'ZZ Cav IT every branch', ${SVC_ALL}, 60, 50000, true, 990),
               (${SVC_B}, ${CATEGORY}, 'ZZ Cav IT only B', ${SVC_B}, 60, 50000, false, 991),
               (${SVC_A}, ${CATEGORY}, 'ZZ Cav IT only A', ${SVC_A}, 60, 50000, false, 992)`),
      db.execute(sql`
        insert into service_branch (service_id, branch_id)
        values (${SVC_B}, ${BRANCH_B}), (${SVC_A}, ${BRANCH_A}), (${SVC_A}, ${BRANCH_B})`),
    ])
    // Narrow the last one to A (the join rows are replaced as the CMS sync does).
    await restrictService(SVC_A, [BRANCH_A])
  }, 60_000)

  afterAll(async () => {
    const like = `${PREFIX}%`
    await db.batch([
      db.execute(
        sql`delete from booking_status_log where booking_id in (select id from booking where id like ${like})`,
      ),
      db.execute(
        sql`delete from booking_service where booking_id in (select id from booking where id like ${like})`,
      ),
      db.execute(sql`delete from booking where id like ${like}`),
      db.execute(sql`delete from service where id like ${like}`),
      db.execute(sql`delete from service_category where id like ${like}`),
      db.execute(sql`delete from staff_profile where user_id like ${like}`),
      db.execute(sql`delete from branch where id like ${like}`),
      db.execute(sql`delete from "user" where id like ${like}`),
    ])
    expect(
      await queryRow(sql`
        select (select count(*) from booking where id like ${like}) as bookings,
               (select count(*) from service where id like ${like}) as services,
               (select count(*) from service_branch where service_id like ${like}) as service_rows,
               (select count(*) from service_category_branch where category_id like ${like}) as category_rows,
               (select count(*) from service_category where id like ${like}) as categories,
               (select count(*) from branch where id like ${like}) as branches,
               (select count(*) from "user" where id like ${like}) as users`),
    ).toEqual({
      bookings: '0',
      services: '0',
      service_rows: '0',
      category_rows: '0',
      categories: '0',
      branches: '0',
      users: '0',
    })
  }, 60_000)

  it(
    'offers a service where its own and its category’s availability both include the branch',
    TIMEOUT,
    async () => {
      // The category is at A and B: an every-branch service follows it.
      expect(await available(SVC_ALL, BRANCH_A)).toBe(true)
      expect(await available(SVC_ALL, BRANCH_B)).toBe(true)
      expect(await available(SVC_B, BRANCH_A)).toBe(false)
      expect(await available(SVC_B, BRANCH_B)).toBe(true)
      expect(await available(SVC_A, BRANCH_A)).toBe(true)
      expect(await available(SVC_A, BRANCH_B)).toBe(false)
      expect(await available('no_such_service', BRANCH_A)).toBe(false)
      // A real all-branches service is offered at the test branches too.
      const real = await queryRow<{ id: string }>(sql`
      select s.id from service s join service_category c on c.id = s.category_id
       where s.all_branches and c.all_branches and s.id not like ${`${PREFIX}%`} limit 1`)
      expect(real).not.toBeNull()
      expect(await available(real?.id ?? '', BRANCH_A)).toBe(true)
    },
  )

  it('includes a branch added later in "all branches", and only there', TIMEOUT, async () => {
    const number = 9300 + Math.floor(Math.random() * 90) + 95
    await db.execute(sql`
      insert into branch (id, number, code, name, address_line1, pincode, phone, display_order,
                          owner_user_id, manager_user_id)
      values (${BRANCH_C}, ${number}, ${`${PREFIX}_C`}, 'ZZ Cav IT C', 'Test', '560100', '0000000000', 992, ${OWNER}, ${MANAGER})`)
    // The category lists A and B, so even its every-branch service isn't at C.
    expect(await available(SVC_ALL, BRANCH_C)).toBe(false)
    await db.execute(sql`update service_category set all_branches = true where id = ${CATEGORY}`)
    try {
      expect(await available(SVC_ALL, BRANCH_C)).toBe(true)
      // A service restricted on its own stays restricted.
      expect(await available(SVC_B, BRANCH_C)).toBe(false)
    } finally {
      await db.execute(sql`update service_category set all_branches = false where id = ${CATEGORY}`)
    }
  })

  it('reports each service’s branches in the catalogue reads', TIMEOUT, async () => {
    const byId = new Map(
      (await getServicesByIds([SVC_ALL, SVC_B, SVC_A])).map((s) => [s.id, s.availableBranchIds]),
    )
    // The category's branches; then each service's narrowing of them.
    expect(byId.get(SVC_ALL)).toEqual([BRANCH_A, BRANCH_B])
    expect(byId.get(SVC_B)).toEqual([BRANCH_B])
    expect(byId.get(SVC_A)).toEqual([BRANCH_A])

    const catalogue = await getActiveCatalogue()
    const ours = catalogue.find((c) => c.id === CATEGORY)
    expect(ours?.services.map((s) => [s.id, s.availableBranchIds])).toEqual([
      [SVC_ALL, [BRANCH_A, BRANCH_B]],
      [SVC_B, [BRANCH_B]],
      [SVC_A, [BRANCH_A]],
    ])
    // Real all-branches services read as null: every branch.
    const real = catalogue.flatMap((c) => c.services).find((s) => !s.id.startsWith(PREFIX))
    expect(real?.availableBranchIds).toBeNull()

    expect((await getRedeemableServiceById(SVC_B))?.availableBranchIds).toEqual([BRANCH_B])

    // Single-table reads too, where Drizzle leaves embedded columns unqualified.
    const grouped = (await getAllServicesGrouped()).find((c) => c.id === CATEGORY)
    expect(grouped?.services.map((s) => [s.id, s.availableBranchIds])).toEqual([
      [SVC_ALL, [BRANCH_A, BRANCH_B]],
      [SVC_B, [BRANCH_B]],
      [SVC_A, [BRANCH_A]],
    ])
    await db.execute(sql`
      update service set gems_redeemable = true, gems_required = 10
       where id = ${SVC_B}`)
    const redeemable = (await getRedeemableServices()).find((s) => s.id === SVC_B)
    expect(redeemable?.availableBranchIds).toEqual([BRANCH_B])
  })

  it(
    'refuses a booking line for a service the booking’s branch doesn’t offer',
    TIMEOUT,
    async () => {
      expect(await refusedBy(book('refused', BRANCH_A, [SVC_ALL, SVC_B]))).toBe(
        `${SQLSTATE.checkViolation} ${BRANCH_AVAILABILITY_CONSTRAINT}`,
      )
      // The whole batch rolled back.
      expect(
        await queryRow(sql`select count(*) as n from booking where id = ${`${PREFIX}_refused`}`),
      ).toEqual({ n: '0' })
      // Offered there: written.
      expect(await refusedBy(book('written', BRANCH_B, [SVC_ALL, SVC_B]))).toBe('written')
    },
  )

  it(
    'refuses changing a line to such a service but keeps an existing line’s (R4.4)',
    TIMEOUT,
    async () => {
      const id = await book('kept', BRANCH_A, [SVC_ALL])
      const line = `${id}_l0`
      expect(
        await refusedBy(
          db.execute(sql`update booking_service set service_id = ${SVC_B} where id = ${line}`),
        ),
      ).toBe(`${SQLSTATE.checkViolation} ${BRANCH_AVAILABILITY_CONSTRAINT}`)

      // Restrict the line's service away from A after it was booked: the line
      // stays and can still change in every other way.
      await restrictService(SVC_ALL, [BRANCH_B])
      try {
        expect(
          await refusedBy(
            db.execute(sql`update booking_service set display_order = 1 where id = ${line}`),
          ),
        ).toBe('written')
        expect(
          await queryRow(sql`select service_id from booking_service where id = ${line}`),
        ).toEqual({ service_id: SVC_ALL })
      } finally {
        await restrictService(SVC_ALL, null)
      }
    },
  )

  it(
    'lists the branch’s bookings still to come with a service it no longer offers',
    TIMEOUT,
    async () => {
      const future = await book('listed', BRANCH_A, [SVC_ALL, SVC_A], '2099-03-05')
      const other = await book('other_branch', BRANCH_B, [SVC_ALL], '2099-03-05')
      const cancelled = await book('cancelled', BRANCH_A, [SVC_A], '2099-03-04')
      await db.execute(sql`update booking set status = 'cancelled' where id = ${cancelled}`)

      expect((await getBookingsWithServicesNotOffered(BRANCH_A)).map((b) => b.id)).not.toContain(
        future,
      )

      // A takes both services away: the pending booking is listed, the
      // cancelled one isn't, nor is B's booking.
      await restrictService(SVC_ALL, [BRANCH_B])
      await restrictService(SVC_A, [BRANCH_B])
      try {
        // (An earlier case's booking at A may be listed too; only this case's count.)
        const listed = (await getBookingsWithServicesNotOffered(BRANCH_A)).filter(
          (b) => b.id === future || b.id === cancelled,
        )
        expect(listed.map((b) => b.id)).toEqual([future])
        expect(listed[0]).toMatchObject({
          bookingNumber: future,
          date: '2099-03-05',
          startTime: '11:00',
          status: 'pending',
          customerName: 'ZZ Cav IT Customer',
          services: ['ZZ Cav IT svc_a', 'ZZ Cav IT svc_all'],
        })
        expect((await getBookingsWithServicesNotOffered(BRANCH_B)).map((b) => b.id)).not.toContain(
          other,
        )
      } finally {
        await restrictService(SVC_ALL, null)
        await restrictService(SVC_A, [BRANCH_A])
      }
    },
  )
})

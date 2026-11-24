/************************************************************
 * Module Name  : reassignments.integration.test
 * Scope        : Integration test — reassignment work (REAL db, R1.7, R5.8)
 *
 * Description  : Against Neon dev, with migrations 0012–0014:
 *                - removing a Stylist takes them off their bookings still to
 *                  come at the branch in the same transaction; a confirmed
 *                  one is listed, a pending one only loses its tentative
 *                  assignee, a past one keeps them;
 *                - taking a shared Manager off one branch releases only that
 *                  branch's bookings;
 *                - approving leave releases that day's bookings only;
 *                - assigning someone closes the work as 'reassigned', ending
 *                  the booking closes it as 'booking_ended' (trigger);
 *                - the database refuses an assignee who left the branch or is
 *                  on approved leave on a confirmed booking's day, and keeps
 *                  history editable; one open entry per booking.
 *
 * Skip behaviour : Skips without packages/db/.env (CI).
 *
 * Data hygiene : Prefixed `rsg_it_<run>` rows, deleted in one transaction in
 *                afterAll, then zero residue is proven.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import { isLiveDbAvailable, queryRow, queryRows } from '../test/live-db'
import { assignStaff, getBookingForAdmin, listBookings } from './admin-bookings'
import { cancelBooking, createBookingWithServices } from './bookings'
import { applyBranchRolePlan, type BranchRoleWrite, getRoleSnapshot } from './branch-roles'
import { getOpenReassignments } from './reassignments'
import { getBookingSummaries, updateLeaveStatus } from './schedule'
import { countUpcomingAssignments } from './staff'

const LIVE = isLiveDbAvailable()
const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `rsg_it_${RUN}`
const BRANCH_A = `${PREFIX}_a`
const BRANCH_B = `${PREFIX}_b`
const OWNER = `${PREFIX}_owner`
const MANAGER = `${PREFIX}_mgr`
const STYLIST_1 = `${PREFIX}_sty1`
const STYLIST_2 = `${PREFIX}_sty2`
const CUSTOMER = `${PREFIX}_cust`
const MANAGER_P = `${MANAGER}_p`
const STYLIST_1P = `${STYLIST_1}_p`
const STYLIST_2P = `${STYLIST_2}_p`
const LEAVE = `${PREFIX}_leave`

let serviceId = ''
const ids: Record<string, string> = {}

async function book(
  key: string,
  branchId: string,
  status: 'pending' | 'confirmed',
  date: string,
  staffId: string | null,
): Promise<string> {
  const created = await createBookingWithServices(
    {
      bookingNumber: `${PREFIX}_${key}`,
      branchId,
      customerId: CUSTOMER,
      status,
      serviceType: 'salon',
      bookingDate: new Date(`${date}T00:00:00.000Z`),
      startTime: '10:00',
      endTime: '11:00',
      totalAmountPaise: 50_000,
      totalDurationMinutes: 60,
    },
    [
      {
        serviceId,
        staffId,
        serviceNameSnapshot: `ZZ IT ${key}`,
        priceAtBookingPaise: 50_000,
        durationMinutes: 60,
        displayOrder: 0,
      },
    ],
  )
  ids[key] = created.id
  return created.id
}

async function staffOf(bookingId: string): Promise<string | null> {
  return (
    (
      await queryRow<{ staff_id: string | null }>(
        sql`select staff_id from booking_service where booking_id = ${bookingId}`,
      )
    )?.staff_id ?? null
  )
}

async function work(bookingId: string) {
  return queryRows<{ reason: string; resolution: string | null; resolved_by_id: string | null }>(
    sql`select reason, resolution, resolved_by_id from booking_reassignment
        where booking_id = ${bookingId} order by created_at`,
  )
}

/** Every message down the error's cause chain (Drizzle wraps the Postgres error). */
async function refusal(write: Promise<unknown>): Promise<string> {
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

async function change(branchId: string, people: string[], writes: BranchRoleWrite[]) {
  const snapshot = await getRoleSnapshot(branchId, [OWNER, ...people])
  return applyBranchRolePlan({
    snapshot,
    writes,
    audit: {
      actorId: OWNER,
      action: 'status_change',
      entityType: 'user',
      entityId: people[0] ?? OWNER,
      branchId,
    },
  })
}

describe.skipIf(!LIVE)('reassignment work against a live database', () => {
  beforeAll(async () => {
    const service = await queryRow<{ id: string }>(
      sql`select id from service where is_active = true order by id limit 1`,
    )
    serviceId = service?.id ?? ''
    const number = 9300 + Math.floor(Math.random() * 90)

    // One transaction: the deferred role checks see every relationship at commit.
    await db.batch([
      db.execute(sql`
        insert into "user" (id, name, email, email_verified, role)
        values (${OWNER}, 'ZZ Rsg IT Owner', ${`${OWNER}@example.invalid`}, false, 'owner'),
               (${MANAGER}, 'ZZ Rsg IT Manager', ${`${MANAGER}@example.invalid`}, false, 'manager'),
               (${STYLIST_1}, 'ZZ Rsg IT Asha', ${`${STYLIST_1}@example.invalid`}, false, 'staff'),
               (${STYLIST_2}, 'ZZ Rsg IT Ravi', ${`${STYLIST_2}@example.invalid`}, false, 'staff'),
               (${CUSTOMER}, 'ZZ Rsg IT Customer', ${`${CUSTOMER}@example.invalid`}, false, 'customer')`),
      db.execute(sql`
        insert into branch (id, number, code, name, address_line1, pincode, phone, display_order,
                            owner_user_id, manager_user_id)
        values (${BRANCH_A}, ${number}, ${`${PREFIX}_A`}, 'ZZ Rsg IT A', 'Test', '560100', '0000000000', 990, ${OWNER}, ${MANAGER}),
               (${BRANCH_B}, ${number + 1}, ${`${PREFIX}_B`}, 'ZZ Rsg IT B', 'Test', '560100', '0000000000', 991, ${OWNER}, ${MANAGER})`),
      db.execute(sql`
        insert into staff_profile (id, user_id, designation, is_active, branch_id, role_witness)
        values (${MANAGER_P}, ${MANAGER}, 'manager', true, null, 'manager'),
               (${STYLIST_1P}, ${STYLIST_1}, 'stylist', true, ${BRANCH_A}, 'staff'),
               (${STYLIST_2P}, ${STYLIST_2}, 'stylist', true, ${BRANCH_A}, 'staff')`),
    ])

    await book('s1_future', BRANCH_A, 'confirmed', '2099-05-01', STYLIST_1P)
    await book('s1_pending', BRANCH_A, 'pending', '2099-05-02', STYLIST_1P)
    await book('s1_past', BRANCH_A, 'confirmed', '2000-01-03', STYLIST_1P)
    await book('mgr_a', BRANCH_A, 'confirmed', '2099-05-03', MANAGER_P)
    await book('mgr_b', BRANCH_B, 'confirmed', '2099-05-03', MANAGER_P)
    await book('s2_day', BRANCH_A, 'confirmed', '2099-06-01', STYLIST_2P)
    await book('s2_next', BRANCH_A, 'confirmed', '2099-06-02', STYLIST_2P)
    await book('s2_pending', BRANCH_A, 'pending', '2099-06-01', null)
  })

  afterAll(async () => {
    const like = `${PREFIX}%`
    await db.batch([
      db.execute(
        sql`delete from booking_status_log where booking_id in (select id from booking where booking_number like ${like})`,
      ),
      db.execute(
        sql`delete from booking_service where booking_id in (select id from booking where booking_number like ${like})`,
      ),
      db.execute(sql`delete from booking where booking_number like ${like}`),
      db.execute(sql`delete from staff_time_off where id like ${like}`),
      db.execute(sql`delete from realtime_revocation where user_id like ${like}`),
      db.execute(sql`delete from audit_log where actor_id like ${like}`),
      db.execute(sql`delete from staff_profile where user_id like ${like}`),
      db.execute(sql`delete from branch where id like ${like}`),
      db.execute(sql`delete from "user" where id like ${like}`),
    ])
    expect(
      await queryRow(sql`
        select (select count(*) from booking where booking_number like ${like}) as bookings,
               (select count(*) from booking_reassignment r
                  where not exists (select 1 from booking b where b.id = r.booking_id)) as orphans,
               (select count(*) from staff_time_off where id like ${like}) as leave,
               (select count(*) from branch where id like ${like}) as branches,
               (select count(*) from "user" where id like ${like}) as users`),
    ).toEqual({ bookings: '0', orphans: '0', leave: '0', branches: '0', users: '0' })
  })

  it('takes a removed Stylist off the bookings still to come, listing the confirmed one', async () => {
    expect(await countUpcomingAssignments(STYLIST_1P, BRANCH_A)).toBe(1)

    const result = await change(
      BRANCH_A,
      [STYLIST_1],
      [
        { kind: 'profile_deactivate', userId: STYLIST_1 },
        { kind: 'user_role', userId: STYLIST_1, from: 'staff', to: 'customer' },
        { kind: 'end_sessions', userId: STYLIST_1 },
      ],
    )

    expect(result).toEqual({ ok: true, signedOut: [STYLIST_1], reassignments: 1 })
    const future = ids.s1_future as string
    expect(await staffOf(future)).toBeNull()
    expect(await work(future)).toEqual([
      { reason: 'left_branch', resolution: null, resolved_by_id: null },
    ])
    // Pending: only the tentative assignee goes; approval assigns someone anyway.
    expect(await staffOf(ids.s1_pending as string)).toBeNull()
    expect(await work(ids.s1_pending as string)).toEqual([])
    // Past: kept for the record.
    expect(await staffOf(ids.s1_past as string)).toBe(STYLIST_1P)

    const detail = await getBookingForAdmin(future, BRANCH_A)
    expect(detail?.reassignment).toMatchObject({
      reason: 'left_branch',
      previousStaffName: 'ZZ Rsg IT Asha',
    })
    expect(detail?.services.map((s) => s.staffName)).toEqual([null])
    const listed = await listBookings(BRANCH_A)
    expect(listed.find((b) => b.id === future)?.reassignment?.reason).toBe('left_branch')
    expect(listed.find((b) => b.id === ids.s2_day)?.reassignment).toBeNull()
  })

  it('releases only the branch a shared Manager stops managing', async () => {
    const result = await change(
      BRANCH_B,
      [MANAGER],
      [{ kind: 'branch_manager', branchId: BRANCH_B, from: MANAGER, to: null }],
    )

    expect(result).toEqual({ ok: true, signedOut: [], reassignments: 1 })
    expect(await staffOf(ids.mgr_b as string)).toBeNull()
    expect(await staffOf(ids.mgr_a as string)).toBe(MANAGER_P)
    expect((await getOpenReassignments(BRANCH_B)).map((w) => w.bookingId)).toEqual([ids.mgr_b])
    expect((await getOpenReassignments(BRANCH_A)).map((w) => w.bookingId)).toEqual([ids.s1_future])
  })

  it('takes someone on approved leave off that day only', async () => {
    await db.execute(sql`
      insert into staff_time_off (id, staff_id, leave_type, date, approval_status)
      values (${LEAVE}, ${STYLIST_2P}, 'casual', '2099-06-01', 'pending')`)
    // A pending request for the same day may still hold them tentatively.
    await db.execute(
      sql`update booking_service set staff_id = ${STYLIST_2P} where booking_id = ${ids.s2_pending as string}`,
    )
    expect(await countUpcomingAssignments(STYLIST_2P, BRANCH_A)).toBe(2)

    const decided = await updateLeaveStatus(LEAVE, BRANCH_A, 'approved', OWNER)

    expect(decided?.leave.approvalStatus).toBe('approved')
    expect(decided?.reassignedBookingIds).toEqual([ids.s2_day])
    expect(await staffOf(ids.s2_day as string)).toBeNull()
    expect(await staffOf(ids.s2_pending as string)).toBeNull()
    expect(await staffOf(ids.s2_next as string)).toBe(STYLIST_2P)
    expect(await work(ids.s2_day as string)).toEqual([
      { reason: 'unavailable', resolution: null, resolved_by_id: null },
    ])
    expect(await countUpcomingAssignments(STYLIST_2P, BRANCH_A)).toBe(1)
    // Summaries only at the branch asked for.
    expect(
      (await getBookingSummaries([ids.s2_day as string], BRANCH_A)).map((s) => s.bookingId),
    ).toEqual([ids.s2_day])
    expect(await getBookingSummaries([ids.s2_day as string], BRANCH_B)).toEqual([])
    // Deciding again changes nothing.
    expect(await updateLeaveStatus(LEAVE, BRANCH_A, 'approved', OWNER)).toBeNull()
  })

  it('refuses an assignee who left or is on leave, and keeps history editable', async () => {
    const future = ids.s1_future as string
    expect(
      await refusal(
        db.execute(
          sql`update booking_service set staff_id = ${STYLIST_1P} where booking_id = ${future}`,
        ),
      ),
    ).toMatch(/does not work at branch/)
    expect(
      await refusal(
        db.execute(
          sql`update booking_service set staff_id = ${STYLIST_2P} where booking_id = ${ids.s2_day as string}`,
        ),
      ),
    ).toMatch(/is on approved leave/)
    // The admin path explains it.
    expect(await refusal(assignStaff(future, BRANCH_A, STYLIST_1P, OWNER))).toMatch(
      /no longer works at this branch/,
    )
    expect(await refusal(assignStaff(ids.s2_day as string, BRANCH_A, STYLIST_2P, OWNER))).toMatch(
      /on approved leave that day/,
    )
    expect(await staffOf(future)).toBeNull()

    // A pending booking may hold them tentatively; a finished one keeps history.
    await db.execute(
      sql`update booking_service set staff_id = ${STYLIST_2P} where booking_id = ${ids.s2_pending as string}`,
    )
    await db.execute(
      sql`update booking set status = 'completed' where id = ${ids.s1_past as string}`,
    )
    await db.execute(
      sql`update booking_service set staff_id = ${STYLIST_1P} where booking_id = ${ids.s1_past as string}`,
    )
    expect(await staffOf(ids.s2_pending as string)).toBe(STYLIST_2P)

    // One open entry per booking.
    expect(
      await refusal(
        db.execute(
          sql`insert into booking_reassignment (booking_id, reason) values (${future}, 'overrun')`,
        ),
      ),
    ).toMatch(/booking_reassignment_open_uidx/)
  })

  it('closes the work when someone is assigned or the booking ends', async () => {
    const future = ids.s1_future as string
    const assigned = await assignStaff(future, BRANCH_A, STYLIST_2P, OWNER)

    expect(assigned.map((s) => s.staffId)).toEqual([STYLIST_2P])
    expect(await work(future)).toEqual([
      { reason: 'left_branch', resolution: 'reassigned', resolved_by_id: OWNER },
    ])

    // B's booking is cancelled instead: the trigger closes its work.
    await cancelBooking(ids.mgr_b as string, OWNER, 'Customer moved it')
    expect(await work(ids.mgr_b as string)).toEqual([
      { reason: 'left_branch', resolution: 'booking_ended', resolved_by_id: null },
    ])
    expect(await getOpenReassignments(BRANCH_B)).toEqual([])
    expect((await getOpenReassignments(BRANCH_A)).map((w) => w.bookingId)).toEqual([ids.s2_day])
  })
})

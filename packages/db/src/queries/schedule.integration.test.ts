/************************************************************
 * Module Name  : schedule.integration.test
 * Scope        : Integration test — branch schedules and leave (REAL db)
 *
 * Description  : The guarded weekly-schedule write and the branch-scoped leave
 *                queries against Neon dev (multi-branch R5.10), with two
 *                throwaway branches A and B, a Manager shared by both and a
 *                Stylist at A:
 *                  - a shared Manager's working day belongs to one branch: B
 *                    can't claim a day A holds, and the whole week rolls back;
 *                  - a day off at B never clears a day A holds;
 *                  - someone who doesn't work at a branch can't be scheduled
 *                    there, even by a direct call;
 *                  - the grid and the leave queue list each branch's people;
 *                  - of two leave decisions, exactly one lands.
 *
 * Skip behaviour : Skips without packages/db/.env (CI). Run it locally with
 *                `bun run test:integration`.
 *
 * Data hygiene : Prefixed `sch_it_<run>` rows, deleted in one transaction in
 *                afterAll (the deferred role triggers need the people, the
 *                branches and the profiles to go together), then zero residue
 *                is proven.
 ************************************************************/

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import { isLiveDbAvailable, queryRow, queryRows } from '../test/live-db'
import {
  getLeaveRequests,
  getScheduleDays,
  getWeeklyScheduleGrid,
  submitLeave,
  updateLeaveStatus,
  upsertStaffSchedule,
} from './schedule'

const LIVE = isLiveDbAvailable()
const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `sch_it_${RUN}`
const BRANCH_A = `${PREFIX}_a`
const BRANCH_B = `${PREFIX}_b`
const MANAGER = `${PREFIX}_mgr`
const STYLIST = `${PREFIX}_sty`
const MANAGER_PROFILE = `${MANAGER}_p`
const STYLIST_PROFILE = `${STYLIST}_p`
const REVIEWER = `${PREFIX}_reviewer`

/** A saved week that took nobody off a booking (these people have none). */
const SAVED = { ok: true, reassignedBookingIds: [] }

/** A week with the given weekdays working 10:00–18:00, the rest off. */
function week(working: number[]) {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    isWorking: working.includes(dayOfWeek),
    startTime: working.includes(dayOfWeek) ? '10:00' : null,
    endTime: working.includes(dayOfWeek) ? '18:00' : null,
  }))
}

/** The working days and the branch holding each. */
async function heldDays(staffId: string) {
  return (await getScheduleDays(staffId))
    .filter((d) => d.isWorking)
    .map((d) => ({ day: d.dayOfWeek, branchId: d.branchId }))
}

describe.skipIf(!LIVE)('branch schedules and leave against a live database', () => {
  beforeAll(async () => {
    const owner = await queryRow<{ id: string }>(
      sql`select owner_user_id as id from branch order by is_primary desc, display_order limit 1`,
    )
    const number = 9600 + Math.floor(Math.random() * 90)
    await db.batch([
      db.execute(sql`
        insert into "user" (id, name, email, email_verified, role)
        values (${MANAGER}, 'ZZ Schedule IT manager', ${`${MANAGER}@example.invalid`}, false, 'manager'),
               (${STYLIST}, 'ZZ Schedule IT stylist', ${`${STYLIST}@example.invalid`}, false, 'staff'),
               (${REVIEWER}, 'ZZ Schedule IT reviewer', ${`${REVIEWER}@example.invalid`}, false, 'customer')`),
      db.execute(sql`
        insert into branch (id, number, code, name, address_line1, pincode, phone, display_order,
                            owner_user_id, manager_user_id)
        values (${BRANCH_A}, ${number}, ${`${PREFIX}_A`}, 'ZZ Schedule IT A', 'Test', '560100', '0000000000', 970, ${owner?.id ?? ''}, ${MANAGER}),
               (${BRANCH_B}, ${number + 1}, ${`${PREFIX}_B`}, 'ZZ Schedule IT B', 'Test', '560100', '0000000000', 971, ${owner?.id ?? ''}, ${MANAGER})`),
      db.execute(sql`
        insert into staff_profile (id, user_id, designation, is_active, role_witness, branch_id)
        values (${MANAGER_PROFILE}, ${MANAGER}, 'manager', true, 'manager', null),
               (${STYLIST_PROFILE}, ${STYLIST}, 'stylist', true, 'staff', ${BRANCH_A})`),
    ])
  })

  afterAll(async () => {
    const like = `${PREFIX}%`
    await db.batch([
      db.execute(sql`delete from staff_time_off where staff_id like ${like}`),
      db.execute(sql`delete from staff_schedule where staff_id like ${like}`),
      db.execute(sql`delete from staff_profile where id like ${like}`),
      db.execute(sql`delete from branch where id like ${like}`),
      db.execute(sql`delete from "user" where id like ${like}`),
    ])
    expect(
      await queryRow(sql`
        select (select count(*) from staff_schedule where staff_id like ${like}) as schedules,
               (select count(*) from branch where id like ${like}) as branches,
               (select count(*) from "user" where id like ${like}) as users`),
    ).toEqual({ schedules: '0', branches: '0', users: '0' })
  })

  it('gives a shared Manager’s working days to the branch that schedules them', async () => {
    expect(await upsertStaffSchedule(MANAGER_PROFILE, BRANCH_A, week([1, 2]))).toEqual(SAVED)

    expect(await heldDays(MANAGER_PROFILE)).toEqual([
      { day: 1, branchId: BRANCH_A },
      { day: 2, branchId: BRANCH_A },
    ])
  })

  it('refuses another branch claiming a day already held, and changes nothing', async () => {
    // B wants Tuesday (held by A) and Wednesday: the whole week rolls back.
    expect(await upsertStaffSchedule(MANAGER_PROFILE, BRANCH_B, week([2, 3]))).toEqual({
      ok: false,
      reason: 'stale',
    })

    expect(await heldDays(MANAGER_PROFILE)).toEqual([
      { day: 1, branchId: BRANCH_A },
      { day: 2, branchId: BRANCH_A },
    ])
  })

  it('never lets a day off at one branch clear a day another branch holds', async () => {
    // B sends Monday and Tuesday as off, Wednesday working.
    expect(await upsertStaffSchedule(MANAGER_PROFILE, BRANCH_B, week([3]))).toEqual(SAVED)

    expect(await heldDays(MANAGER_PROFILE)).toEqual([
      { day: 1, branchId: BRANCH_A },
      { day: 2, branchId: BRANCH_A },
      { day: 3, branchId: BRANCH_B },
    ])
  })

  it('releases a day only for the branch that held it', async () => {
    // A gives up Tuesday; Wednesday stays with B.
    expect(await upsertStaffSchedule(MANAGER_PROFILE, BRANCH_A, week([1]))).toEqual(SAVED)

    expect(await heldDays(MANAGER_PROFILE)).toEqual([
      { day: 1, branchId: BRANCH_A },
      { day: 3, branchId: BRANCH_B },
    ])
  })

  it('refuses scheduling someone at a branch they don’t work at', async () => {
    expect(await upsertStaffSchedule(STYLIST_PROFILE, BRANCH_B, week([4]))).toEqual({
      ok: false,
      reason: 'stale',
    })
    expect(await heldDays(STYLIST_PROFILE)).toEqual([])

    expect(await upsertStaffSchedule(STYLIST_PROFILE, BRANCH_A, week([4]))).toEqual(SAVED)
    expect(await heldDays(STYLIST_PROFILE)).toEqual([{ day: 4, branchId: BRANCH_A }])
  })

  it('lists each branch’s own people in the weekly grid', async () => {
    const atA = await getWeeklyScheduleGrid(BRANCH_A, '2099-01-04')
    const atB = await getWeeklyScheduleGrid(BRANCH_B, '2099-01-04')

    expect(atA.staff.map((s) => s.staff.id).sort()).toEqual([MANAGER_PROFILE, STYLIST_PROFILE])
    expect(atB.staff.map((s) => s.staff.id)).toEqual([MANAGER_PROFILE])
    expect(atA.dates).toHaveLength(7)
  })

  it('lists leave per branch, and lets exactly one of two decisions land', async () => {
    const managerLeave = await submitLeave(MANAGER_PROFILE, {
      leaveType: 'casual',
      date: '2099-01-05',
    })
    const stylistLeave = await submitLeave(STYLIST_PROFILE, {
      leaveType: 'sick',
      date: '2099-01-06',
    })

    const idsAt = async (branchId: string) =>
      (await getLeaveRequests(branchId)).map((l) => l.id).sort()
    expect(await idsAt(BRANCH_A)).toEqual([managerLeave.id, stylistLeave.id].sort())
    expect(await idsAt(BRANCH_B)).toEqual([managerLeave.id])

    // B can't decide the Stylist's leave at all: they don't work there.
    expect(await updateLeaveStatus(stylistLeave.id, BRANCH_B, 'approved', REVIEWER)).toBeNull()

    const [first, second] = await Promise.all([
      updateLeaveStatus(managerLeave.id, BRANCH_A, 'approved', REVIEWER),
      updateLeaveStatus(managerLeave.id, BRANCH_B, 'rejected', REVIEWER, 'No cover'),
    ])
    expect([first, second].filter((r) => r !== null)).toHaveLength(1)

    const decided = await queryRows<{ approval_status: string }>(
      sql`select approval_status from staff_time_off where id = ${managerLeave.id}`,
    )
    expect(decided).toHaveLength(1)
    expect(['approved', 'rejected']).toContain(decided[0]?.approval_status)
  })
})

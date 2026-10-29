/************************************************************
 * Module Name  : branch-roles.integration.test
 * Scope        : Integration test — Branch role changes against a REAL database
 *
 * Description  : Runs getRoleSnapshot and applyBranchRolePlan against Neon dev,
 *                the only way to prove what the database itself guarantees:
 *                  - the role-qualified keys really defer inside a neon-http
 *                    batch, so an Owner handover can write the branch first;
 *                  - a stale snapshot aborts the whole change;
 *                  - the one-Receptionist index and the deferred keys reject a
 *                    wrong final state at commit, and nothing is kept;
 *                  - re-adding a removed person reactivates their profile;
 *                  - two changes to a shared Manager made from the same moment
 *                    can't both commit (the write-skew case in
 *                    spike-results.md §2), and a change waits for the person's
 *                    row lock instead of running beside another change;
 *                  - direct SQL can't break the relationships either: the
 *                    profile checks, the single-Developer index and the
 *                    deferred triggers of migration 0006 reject it (R1.3).
 *
 * Skip behaviour : CI has no Neon branch and no `packages/db/.env`, so the suite
 *                skips there. Run it locally with `bun run test:integration`.
 *
 * Data hygiene : Every row carries the `role_it_<run>` prefix and is deleted in
 *                afterAll, which then proves zero residue. Seeding and clean-up
 *                each run as one transaction, as the deferred triggers require
 *                (an Owner can't exist without a branch even for a moment of
 *                autocommit). The writes are made by hand, not by the
 *                planner: the point is to exercise the database, including
 *                plans the planner would never make.
 ************************************************************/

import { type SQL, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../index'
import { isLiveDbAvailable, queryRow, queryRows } from '../test/live-db'
import {
  applyBranchRolePlan,
  type BranchRoleAudit,
  type BranchRoleSnapshot,
  type BranchRoleWrite,
  getRoleSnapshot,
} from './branch-roles'
import { isConstraintViolation, SQLSTATE } from './driver-errors'

const LIVE = isLiveDbAvailable()

const RUN = Math.random().toString(36).slice(2, 8)
const PREFIX = `role_it_${RUN}`

const ACTOR = `${PREFIX}_actor`
const O1 = `${PREFIX}_o1`
const O2 = `${PREFIX}_o2`
const O3 = `${PREFIX}_o3`
const M1 = `${PREFIX}_m1`
const R1 = `${PREFIX}_r1`
const C1 = `${PREFIX}_c1`
const C2 = `${PREFIX}_c2`
const C3 = `${PREFIX}_c3`
const B1 = `${PREFIX}_b1`
const B2 = `${PREFIX}_b2`

const PEOPLE: ReadonlyArray<readonly [string, string]> = [
  [ACTOR, 'customer'],
  [O1, 'owner'],
  [O2, 'customer'],
  [O3, 'owner'],
  [M1, 'manager'],
  [R1, 'receptionist'],
  [C1, 'customer'],
  [C2, 'customer'],
  [C3, 'customer'],
]

// Branch numbers are unique; keep clear of the real ones (1, 2, ...).
const NUMBER = 9000 + Math.floor(Math.random() * 900)

function auditFor(entityId: string, branchId: string): BranchRoleAudit {
  return {
    actorId: ACTOR,
    action: 'update',
    entityType: 'branch_role',
    entityId,
    branchId,
    newValues: { test: PREFIX },
  }
}

// The audit names the branch the first branch write (or B1) is for.
async function apply(snapshot: BranchRoleSnapshot, writes: BranchRoleWrite[], target: string) {
  const at = writes.find((w) => w.kind === 'branch_owner' || w.kind === 'branch_manager')
  const branchId = at && 'branchId' in at ? at.branchId : B1
  return applyBranchRolePlan({ snapshot, writes, audit: auditFor(target, branchId) })
}

/** Run statements as one transaction. */
async function transaction(...statements: SQL[]) {
  const [first, ...rest] = statements.map((s) => db.execute(s))
  if (!first) {
    return
  }
  await db.batch([first, ...rest])
}

async function roleOf(id: string): Promise<string | null> {
  const row = await queryRow<{ role: string | null }>(sql`select role from "user" where id = ${id}`)
  return row?.role ?? null
}

type ProfileRow = {
  id: string
  designation: string
  is_active: boolean
  branch_id: string | null
  role_witness: string | null
  specialization: string | null
}

async function profileOf(userId: string): Promise<ProfileRow | null> {
  return queryRow<ProfileRow>(sql`
    select id, designation, is_active, branch_id, role_witness, specialization
    from staff_profile where user_id = ${userId}`)
}

async function branchRefs(id: string) {
  return queryRow<{ owner_user_id: string | null; manager_user_id: string | null }>(
    sql`select owner_user_id, manager_user_id from branch where id = ${id}`,
  )
}

async function count(query: SQL): Promise<number> {
  return Number((await queryRow<{ n: string }>(query))?.n ?? 0)
}

/** The error a direct write raised, expected to name `constraint`. */
async function rejection(write: Promise<unknown>): Promise<unknown> {
  try {
    await write
  } catch (error) {
    return error
  }
  throw new Error('expected the write to be rejected')
}

describe.skipIf(!LIVE)('branch role changes against a live database', () => {
  beforeAll(async () => {
    const people = PEOPLE.map(
      ([id, role]) =>
        sql`(${id}, ${`ZZ Role IT ${id}`}, ${`${id}@example.invalid`}, false, ${role})`,
    )
    await transaction(
      sql`insert into "user" (id, name, email, email_verified, role) values ${sql.join(people, sql`, `)}`,
      sql`insert into branch (id, number, code, name, address_line1, pincode, phone,
                              display_order, owner_user_id, manager_user_id)
          values (${B1}, ${NUMBER}, ${`${PREFIX}_1`}, 'ZZ Role IT 1', 'Test', '560000', '0000000000',
                  900, ${O1}, ${M1}),
                 (${B2}, ${NUMBER + 1}, ${`${PREFIX}_2`}, 'ZZ Role IT 2', 'Test', '560000',
                  '0000000000', 901, ${O3}, ${M1})`,
      sql`insert into staff_profile (id, user_id, designation, is_active, branch_id, role_witness)
          values (${`${M1}_p`}, ${M1}, 'manager', true, null, 'manager'),
                 (${`${R1}_p`}, ${R1}, 'receptionist', true, ${B1}, 'receptionist')`,
      sql`insert into session (id, user_id, expires_at, token)
          values (${`${O1}_s`}, ${O1}, now() + interval '1 day', ${`${O1}_token`}),
                 (${`${R1}_s`}, ${R1}, now() + interval '1 day', ${`${R1}_token`})`,
    )
  })

  afterAll(async () => {
    const like = `${PREFIX}%`
    await transaction(
      sql`delete from audit_log where actor_id like ${like}`,
      sql`delete from staff_profile where user_id like ${like}`,
      sql`delete from branch where id like ${like}`,
      sql`delete from "user" where id like ${like}`,
    )

    const residue = await queryRow(sql`
      select (select count(*) from "user" where id like ${like}) as users,
             (select count(*) from branch where id like ${like}) as branches,
             (select count(*) from staff_profile where user_id like ${like}) as profiles,
             (select count(*) from session where user_id like ${like}) as sessions,
             (select count(*) from realtime_revocation where user_id like ${like}) as revocations,
             (select count(*) from audit_log where actor_id like ${like}) as audits`)
    expect(residue).toEqual({
      users: '0',
      branches: '0',
      profiles: '0',
      sessions: '0',
      revocations: '0',
      audits: '0',
    })
  })

  it('reads the people involved and every branch', async () => {
    const snapshot = await getRoleSnapshot(B1, [ACTOR, O2])

    // The actor and target, plus B1's Owner, Manager and Receptionist.
    expect(snapshot.users.map((u) => u.id).sort()).toEqual([ACTOR, M1, O1, O2, R1].sort())
    expect(snapshot.profiles.map((p) => p.userId).sort()).toEqual([M1, R1].sort())
    expect(snapshot.branches.map((b) => b.id)).toEqual(expect.arrayContaining([B1, B2]))
  })

  it('hands B1 over with the branch written before the new Owner has the role', async () => {
    const snapshot = await getRoleSnapshot(B1, [ACTOR, O2])

    // The planner's order: without the deferred keys, the first statement
    // would fail because O2 is not an owner yet.
    const result = await apply(
      snapshot,
      [
        { kind: 'branch_owner', branchId: B1, from: O1, to: O2 },
        { kind: 'user_role', userId: O2, from: 'customer', to: 'owner' },
        { kind: 'user_role', userId: O1, from: 'owner', to: 'customer' },
        { kind: 'end_sessions', userId: O1 },
      ],
      O2,
    )

    expect(result).toEqual({ ok: true, signedOut: [O1], reassignments: 0 })
    expect(await branchRefs(B1)).toEqual({ owner_user_id: O2, manager_user_id: M1 })
    expect(await roleOf(O2)).toBe('owner')
    expect(await roleOf(O1)).toBe('customer')
    expect(await count(sql`select count(*) as n from session where user_id = ${O1}`)).toBe(0)
    // The outgoing Owner's live-update tokens are revoked with the change (R2.6).
    expect(
      await queryRows(
        sql`select outcome, resolved_at from realtime_revocation where user_id = ${O1}`,
      ),
    ).toEqual([{ outcome: null, resolved_at: null }])
    expect(
      await count(sql`select count(*) as n from realtime_revocation where user_id = ${O2}`),
    ).toBe(0)
    expect(
      await queryRow(sql`
        select action, entity_type, branch_id from audit_log
        where actor_id = ${ACTOR} and entity_id = ${O2}`),
    ).toEqual({ action: 'update', entity_type: 'branch_role', branch_id: B1 })
  })

  it('writes nothing when a row the plan was made from changed', async () => {
    const snapshot = await getRoleSnapshot(B1, [ACTOR, C1])
    // Behind the snapshot's back: B2 loses its Manager (M1 still manages B1).
    await queryRows(sql`update branch set manager_user_id = null where id = ${B2}`)

    const result = await apply(
      snapshot,
      [
        { kind: 'user_role', userId: C1, from: 'customer', to: 'staff' },
        {
          kind: 'profile_activate',
          userId: C1,
          designation: 'stylist',
          roleWitness: 'staff',
          branchId: B1,
        },
      ],
      C1,
    )

    expect(result).toEqual({ ok: false, reason: 'stale' })
    expect(await roleOf(C1)).toBe('customer')
    expect(await profileOf(C1)).toBeNull()
    expect(
      await count(
        sql`select count(*) as n from audit_log where actor_id = ${ACTOR} and entity_id = ${C1}`,
      ),
    ).toBe(0)

    await queryRows(sql`update branch set manager_user_id = ${M1} where id = ${B2}`)
  })

  it('replaces the Receptionist, keeping the old profile as history', async () => {
    const snapshot = await getRoleSnapshot(B1, [ACTOR, C2])

    const result = await apply(
      snapshot,
      [
        { kind: 'profile_deactivate', userId: R1 },
        { kind: 'user_role', userId: R1, from: 'receptionist', to: 'customer' },
        { kind: 'user_role', userId: C2, from: 'customer', to: 'receptionist' },
        {
          kind: 'profile_activate',
          userId: C2,
          designation: 'receptionist',
          roleWitness: 'receptionist',
          branchId: B1,
        },
        { kind: 'end_sessions', userId: R1 },
      ],
      C2,
    )

    expect(result).toEqual({ ok: true, signedOut: [R1] })
    expect(await roleOf(R1)).toBe('customer')
    expect(await profileOf(R1)).toMatchObject({
      is_active: false,
      role_witness: null,
      branch_id: B1,
    })
    expect(await roleOf(C2)).toBe('receptionist')
    expect(await profileOf(C2)).toMatchObject({
      designation: 'receptionist',
      is_active: true,
      role_witness: 'receptionist',
      branch_id: B1,
    })
    expect(await count(sql`select count(*) as n from session where user_id = ${R1}`)).toBe(0)
  })

  it('rejects a second Receptionist at a branch and keeps nothing', async () => {
    const snapshot = await getRoleSnapshot(B1, [ACTOR, C3])

    const result = await apply(
      snapshot,
      [
        { kind: 'user_role', userId: C3, from: 'customer', to: 'receptionist' },
        {
          kind: 'profile_activate',
          userId: C3,
          designation: 'receptionist',
          roleWitness: 'receptionist',
          branchId: B1,
        },
      ],
      C3,
    )

    expect(result).toEqual({ ok: false, reason: 'stale' })
    expect(await roleOf(C3)).toBe('customer')
    expect(await profileOf(C3)).toBeNull()
  })

  it('rejects at commit a Manager demoted while still managing another branch', async () => {
    const snapshot = await getRoleSnapshot(B1, [ACTOR, M1])

    // Wrong on purpose: M1 still manages B2, so the role key rejects it.
    const result = await apply(
      snapshot,
      [
        { kind: 'profile_deactivate', userId: M1 },
        { kind: 'branch_manager', branchId: B1, from: M1, to: null },
        { kind: 'user_role', userId: M1, from: 'manager', to: 'customer' },
        { kind: 'end_sessions', userId: M1 },
      ],
      M1,
    )

    expect(result).toEqual({ ok: false, reason: 'stale' })
    expect(await branchRefs(B1)).toEqual({ owner_user_id: O2, manager_user_id: M1 })
    expect(await roleOf(M1)).toBe('manager')
    expect(await profileOf(M1)).toMatchObject({ is_active: true, role_witness: 'manager' })
  })

  it('rejects direct SQL that leaves a Manager with no branch (deferred trigger)', async () => {
    const error = await rejection(
      queryRows(
        sql`update branch set manager_user_id = null where manager_user_id = ${M1} and id like ${`${PREFIX}%`}`,
      ),
    )
    expect(isConstraintViolation(error, SQLSTATE.checkViolation, ['role_relationships'])).toBe(true)
    expect(await branchRefs(B1)).toMatchObject({ manager_user_id: M1 })
    expect(await branchRefs(B2)).toMatchObject({ manager_user_id: M1 })
  })

  it('rejects direct SQL that breaks a profile or adds a second Developer', async () => {
    // An inactive profile must not keep granting its role.
    const stillGranting = await rejection(
      queryRows(sql`update staff_profile set is_active = false where user_id = ${C2}`),
    )
    expect(
      isConstraintViolation(stillGranting, SQLSTATE.checkViolation, [
        'staff_profile_active_witness_check',
      ]),
    ).toBe(true)

    // A Receptionist's title is Receptionist.
    const wrongTitle = await rejection(
      queryRows(sql`update staff_profile set designation = 'stylist' where user_id = ${C2}`),
    )
    expect(
      isConstraintViolation(wrongTitle, SQLSTATE.checkViolation, [
        'staff_profile_designation_matches_role_check',
      ]),
    ).toBe(true)

    // Closing the profile properly still leaves a Receptionist without one.
    const noProfile = await rejection(
      queryRows(
        sql`update staff_profile set is_active = false, role_witness = null where user_id = ${C2}`,
      ),
    )
    expect(isConstraintViolation(noProfile, SQLSTATE.checkViolation, ['role_relationships'])).toBe(
      true,
    )

    const secondDeveloper = await rejection(
      queryRows(sql`
        insert into "user" (id, name, email, email_verified, role)
        values (${`${PREFIX}_dev2`}, 'ZZ Role IT dev2', ${`${PREFIX}_dev2@example.invalid`},
                false, 'developer')`),
    )
    expect(
      isConstraintViolation(secondDeveloper, SQLSTATE.uniqueViolation, ['user_one_developer']),
    ).toBe(true)

    expect(await profileOf(C2)).toMatchObject({
      designation: 'receptionist',
      is_active: true,
      role_witness: 'receptionist',
    })
  })

  it('adds, removes and re-adds staff, reactivating the same profile', async () => {
    const add = await apply(
      await getRoleSnapshot(B2, [ACTOR, C1]),
      [
        { kind: 'user_role', userId: C1, from: 'customer', to: 'staff' },
        {
          kind: 'profile_activate',
          userId: C1,
          designation: 'stylist',
          roleWitness: 'staff',
          branchId: B2,
          specialization: 'Keratin',
        },
      ],
      C1,
    )
    expect(add.ok).toBe(true)
    const added = await profileOf(C1)
    expect(added).toMatchObject({
      designation: 'stylist',
      is_active: true,
      branch_id: B2,
      role_witness: 'staff',
      specialization: 'Keratin',
    })

    const remove = await apply(
      await getRoleSnapshot(B2, [ACTOR, C1]),
      [
        { kind: 'profile_deactivate', userId: C1 },
        { kind: 'user_role', userId: C1, from: 'staff', to: 'customer' },
        { kind: 'end_sessions', userId: C1 },
      ],
      C1,
    )
    expect(remove).toEqual({ ok: true, signedOut: [C1] })
    expect(await roleOf(C1)).toBe('customer')
    expect(await profileOf(C1)).toMatchObject({ is_active: false, role_witness: null })

    const readd = await apply(
      await getRoleSnapshot(B1, [ACTOR, C1]),
      [
        { kind: 'user_role', userId: C1, from: 'customer', to: 'staff' },
        {
          kind: 'profile_activate',
          userId: C1,
          designation: 'therapist',
          roleWitness: 'staff',
          branchId: B1,
        },
      ],
      C1,
    )
    expect(readd.ok).toBe(true)
    expect(await profileOf(C1)).toEqual({
      id: added?.id,
      designation: 'therapist',
      is_active: true,
      branch_id: B1,
      role_witness: 'staff',
      specialization: 'Keratin',
    })
  })

  it('lets only one of two simultaneous removals of a shared Manager commit', async () => {
    // Both read while M1 manages B1 and B2, so each plan keeps M1 a Manager
    // because of the other branch. Committing both would leave a Manager with
    // no branch.
    const [fromB1, fromB2] = await Promise.all([
      getRoleSnapshot(B1, [ACTOR, M1]),
      getRoleSnapshot(B2, [ACTOR, M1]),
    ])

    const results = await Promise.all([
      apply(fromB1, [{ kind: 'branch_manager', branchId: B1, from: M1, to: null }], M1),
      apply(fromB2, [{ kind: 'branch_manager', branchId: B2, from: M1, to: null }], M1),
    ])

    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'stale' }])
    const managed = await count(
      sql`select count(*) as n from branch where manager_user_id = ${M1} and id like ${`${PREFIX}%`}`,
    )
    expect(managed).toBe(1)
    expect(await roleOf(M1)).toBe('manager')
  })

  it("waits for another change's lock on a person instead of running beside it", async () => {
    const free = (await branchRefs(B1))?.manager_user_id === null ? B1 : B2
    const snapshot = await getRoleSnapshot(free, [ACTOR, M1])
    await queryRow(sql`select 1 as warm`)

    // Another transaction holds M1's row lock for 2.5 seconds, changing nothing.
    const holder = db.batch([
      db.execute(sql`select id from "user" where id = ${M1} for no key update`),
      db.execute(sql`select pg_sleep(2.5)`),
    ])
    await new Promise((resolve) => setTimeout(resolve, 800))

    const started = Date.now()
    const result = await apply(
      snapshot,
      [{ kind: 'branch_manager', branchId: free, from: null, to: M1 }],
      M1,
    )
    const waited = Date.now() - started
    await holder

    expect(result).toEqual({ ok: true, signedOut: [] })
    expect(waited).toBeGreaterThanOrEqual(1000)
    expect((await branchRefs(free))?.manager_user_id).toBe(M1)
  }, 20_000)
})

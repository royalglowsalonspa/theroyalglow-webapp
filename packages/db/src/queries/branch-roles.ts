/************************************************************
 * Module Name  : branch-roles
 * Scope        : Data Access — Branch roles (multi-branch R1.2–R1.7, R1.11)
 *
 * Description  : Reads the rows a role change is planned from
 *                (getRoleSnapshot) and applies a planned change in one
 *                transaction (applyBranchRolePlan). The plan itself comes from
 *                @rgss/business planBranchRoleChange. db can't import business,
 *                so the shapes are restated here; the admin route passes the
 *                plan straight through, so the compiler keeps them in step.
 *
 * The transaction, one neon-http db.batch() (READ COMMITTED):
 *  1. Defer the three role-qualified keys to commit, so the writes may run in
 *     any order: a role and every row that refers to it change together.
 *  2. Lock the people in the snapshot, then every branch, each in ID order,
 *     FOR NO KEY UPDATE. Every role change takes the same locks in the same
 *     order, so two concurrent changes run one after the other. Ordinary
 *     writes aren't blocked: their foreign-key checks take KEY SHARE locks.
 *  3. Check that every row the plan was made from is unchanged. If anything
 *     differs, `1 / 0` aborts the whole batch and the caller reports a stale
 *     change. The locks keep those rows from changing until commit.
 *  4. The writes. Each update is a compare-and-set on the value the plan
 *     expects, and aborts the batch when it matches no row.
 *  5. Bookings still to come whose assignee no longer works at their branch
 *     lose that assignee and are listed for reassignment (R1.7).
 *  6. One realtime revocation intent per person signed out (R2.6), so their
 *     live-update tokens are revoked even when the call to Ably fails now.
 *  7. One audit entry, committed with the change (R1.11).
 *
 * The database is the final safety net: the deferred keys, the
 * one-Receptionist index, the profile checks and the deferred relationship
 * triggers (migration 0006) reject anything the plan got wrong, and those
 * rejections are reported as a stale change too.
 *
 * Notes : A sign-out deletes the person's sessions. Better Auth's cookie
 *         cache can keep a browser's session data for up to 5 minutes, but
 *         every admin request re-reads the role and branches from the
 *         database, so the authority goes at once.
 ************************************************************/

import { asc, eq, inArray, or, type SQL, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db } from '../index'
import { session, user } from '../schema/auth'
import { branch } from '../schema/branch'
import { staffProfile } from '../schema/profile'
import { auditLog } from '../schema/system'
import { findDriverError, isConstraintViolation, isGuardAbort, SQLSTATE } from './driver-errors'
import { realtimeRevocationStatement } from './realtime-revocations'
import { releaseAssignmentsOfPeopleStatement, releasedBookingIds } from './reassignments'

type StaffDesignation = (typeof staffProfile.$inferSelect)['designation']
type BranchStatus = (typeof branch.$inferSelect)['status']
type AuditAction = (typeof auditLog.$inferInsert)['action']

export type RoleSnapshotUserRow = { id: string; role: string | null }

export type RoleSnapshotProfileRow = {
  userId: string
  designation: StaffDesignation
  branchId: string | null
  roleWitness: string | null
  isActive: boolean
}

export type RoleSnapshotBranchRow = {
  id: string
  name: string
  code: string
  status: BranchStatus
  isPrimary: boolean
  displayOrder: number
  ownerUserId: string | null
  managerUserId: string | null
}

/** The rows a role change is planned from. */
export type BranchRoleSnapshot = {
  users: RoleSnapshotUserRow[]
  profiles: RoleSnapshotProfileRow[]
  branches: RoleSnapshotBranchRow[]
}

export type PerformingRoleWitness = 'staff' | 'receptionist' | 'manager'

/** One write of a planned role change (mirrors @rgss/business RoleWrite). */
export type BranchRoleWrite =
  | { kind: 'profile_deactivate'; userId: string }
  | { kind: 'branch_owner'; branchId: string; from: string | null; to: string }
  | { kind: 'branch_manager'; branchId: string; from: string | null; to: string | null }
  | { kind: 'user_role'; userId: string; from: string | null; to: string }
  | {
      kind: 'profile_activate'
      userId: string
      designation: StaffDesignation
      roleWitness: PerformingRoleWitness
      branchId: string | null
      specialization?: string | null | undefined
    }
  | { kind: 'end_sessions'; userId: string }

/** The audit entry written in the same transaction as the change. */
export type BranchRoleAudit = {
  actorId: string
  action: AuditAction
  entityType: string
  entityId: string
  /** The branch the change was made at. */
  branchId: string | null
  oldValues?: unknown
  newValues?: unknown
  ipAddress?: string | null
}

export type ApplyBranchRolePlanResult =
  /** `reassignments`: bookings still to come that lost their assignee (R1.7). */
  { ok: true; signedOut: string[]; reassignments: number } | { ok: false; reason: 'stale' }

/** The role-qualified keys from migration 0004. Deferred inside a role change. */
export const ROLE_KEYS = ['branch_owner_fk', 'branch_manager_fk', 'staff_profile_role_fk'] as const

const ONE_RECEPTIONIST_INDEX = 'staff_profile_one_receptionist_per_branch'

// Checks a wrong final state trips (migrations 0004 and 0006). The last two are
// the deferred triggers' names for a missing relationship and the Developer.
const ROLE_STATE_CHECKS = [
  'branch_owner_is_not_manager_check',
  'staff_profile_active_witness_check',
  'staff_profile_designation_matches_role_check',
  'staff_profile_branch_by_role_check',
  'role_relationships',
  'one_developer',
] as const

const USER_COLUMNS = { id: user.id, role: user.role } as const

const PROFILE_COLUMNS = {
  userId: staffProfile.userId,
  designation: staffProfile.designation,
  branchId: staffProfile.branchId,
  roleWitness: staffProfile.roleWitness,
  isActive: staffProfile.isActive,
} as const

const BRANCH_COLUMNS = {
  id: branch.id,
  name: branch.name,
  code: branch.code,
  status: branch.status,
  isPrimary: branch.isPrimary,
  displayOrder: branch.displayOrder,
  ownerUserId: branch.ownerUserId,
  managerUserId: branch.managerUserId,
} as const

/** The branch's current Owner, Manager and Receptionist. */
function holdersOf(branchId: string): SQL {
  return sql`(select ${branch.ownerUserId} from ${branch} where ${branch.id} = ${branchId}
    union select ${branch.managerUserId} from ${branch} where ${branch.id} = ${branchId}
    union select ${staffProfile.userId} from ${staffProfile}
      where ${staffProfile.branchId} = ${branchId} and ${staffProfile.roleWitness} = 'receptionist')`
}

/**
 * The rows a role change at `branchId` is planned from: every branch, the
 * people in `userIds`, and the branch's current Owner, Manager and
 * Receptionist, with their staff profiles. Pass the actor as well as the
 * target: the actor's own authority is then re-checked when the plan is
 * applied, and their branch access can be worked out from the same rows.
 */
export async function getRoleSnapshot(
  branchId: string,
  userIds: readonly string[],
): Promise<BranchRoleSnapshot> {
  const ids = [...new Set(userIds)]
  const holders = holdersOf(branchId)

  const [users, profiles, branches] = await db.batch([
    db
      .select(USER_COLUMNS)
      .from(user)
      .where(or(inArray(user.id, ids), sql`${user.id} in ${holders}`))
      .orderBy(asc(user.id)),
    db
      .select(PROFILE_COLUMNS)
      .from(staffProfile)
      .where(or(inArray(staffProfile.userId, ids), sql`${staffProfile.userId} in ${holders}`))
      .orderBy(asc(staffProfile.userId)),
    db.select(BRANCH_COLUMNS).from(branch).orderBy(asc(branch.displayOrder), asc(branch.id)),
  ])
  return { users, profiles, branches }
}

const DEFER_ROLE_KEYS = sql.raw(`set constraints ${ROLE_KEYS.join(', ')} deferred`)

const LOCK_BRANCHES = sql`select ${branch.id} from ${branch} order by ${branch.id} for no key update`

function lockPeople(ids: readonly string[]): SQL {
  return sql`select ${user.id} from ${user} where ${inArray(user.id, [...ids])} order by ${user.id} for no key update`
}

// jsonb containment both ways is set equality: every object carries every
// key, so one contains another only when they are equal. No ordering or
// collation is involved.
function sameRows(actual: SQL, expected: string): SQL {
  return sql`(${actual} @> ${expected}::jsonb and ${expected}::jsonb @> ${actual})`
}

/** Aborts the transaction unless the snapshot's rows are still exactly as read. */
function unchangedGuard(snapshot: BranchRoleSnapshot): SQL {
  const ids = snapshot.users.map((u) => u.id)
  const users = JSON.stringify(snapshot.users.map((u) => ({ id: u.id, role: u.role ?? null })))
  const profiles = JSON.stringify(
    snapshot.profiles.map((p) => ({
      userId: p.userId,
      designation: p.designation,
      branchId: p.branchId ?? null,
      roleWitness: p.roleWitness ?? null,
      isActive: p.isActive,
    })),
  )
  const branches = JSON.stringify(
    snapshot.branches.map((b) => ({
      id: b.id,
      status: b.status,
      ownerUserId: b.ownerUserId ?? null,
      managerUserId: b.managerUserId ?? null,
    })),
  )

  return sql`select 1 / (case when ${sameRows(sql`u.v`, users)} and ${sameRows(sql`p.v`, profiles)}
      and ${sameRows(sql`b.v`, branches)} then 1 else 0 end) as ok
    from (select coalesce(jsonb_agg(jsonb_build_object('id', ${user.id}, 'role', ${user.role})), '[]'::jsonb) as v
            from ${user} where ${inArray(user.id, ids)}) u,
         (select coalesce(jsonb_agg(jsonb_build_object(
              'userId', ${staffProfile.userId}, 'designation', ${staffProfile.designation},
              'branchId', ${staffProfile.branchId}, 'roleWitness', ${staffProfile.roleWitness},
              'isActive', ${staffProfile.isActive})), '[]'::jsonb) as v
            from ${staffProfile} where ${inArray(staffProfile.userId, ids)}) p,
         (select coalesce(jsonb_agg(jsonb_build_object(
              'id', ${branch.id}, 'status', ${branch.status},
              'ownerUserId', ${branch.ownerUserId}, 'managerUserId', ${branch.managerUserId})), '[]'::jsonb) as v
            from ${branch}) b`
}

// Postgres rejects table-qualified column names in SET, so use the bare name.
function column(c: { name: string }): ReturnType<typeof sql.identifier> {
  return sql.identifier(c.name)
}

/** An UPDATE that aborts the transaction when it matches no row. */
function guarded(update: SQL): SQL {
  return sql`with changed as (${update} returning 1) select 1 / count(*)::int as ok from changed`
}

function statementFor(write: BranchRoleWrite): BatchItem<'pg'> {
  switch (write.kind) {
    case 'profile_deactivate':
      // The profile keeps its last branch as history; without the witness it
      // grants nothing and no longer holds the branch's Receptionist place.
      return db.execute(
        guarded(sql`update ${staffProfile}
          set ${column(staffProfile.isActive)} = false, ${column(staffProfile.roleWitness)} = null,
              ${column(staffProfile.updatedAt)} = now()
          where ${staffProfile.userId} = ${write.userId} and ${staffProfile.isActive} = true`),
      )
    case 'branch_owner':
      return db.execute(
        guarded(sql`update ${branch}
          set ${column(branch.ownerUserId)} = ${write.to}, ${column(branch.updatedAt)} = now()
          where ${branch.id} = ${write.branchId} and ${branch.ownerUserId} is not distinct from ${write.from}`),
      )
    case 'branch_manager':
      return db.execute(
        guarded(sql`update ${branch}
          set ${column(branch.managerUserId)} = ${write.to}, ${column(branch.updatedAt)} = now()
          where ${branch.id} = ${write.branchId} and ${branch.managerUserId} is not distinct from ${write.from}`),
      )
    case 'user_role':
      return db.execute(
        guarded(sql`update ${user}
          set ${column(user.role)} = ${write.to}, ${column(user.updatedAt)} = now()
          where ${user.id} = ${write.userId} and ${user.role} is not distinct from ${write.from}`),
      )
    case 'profile_activate': {
      // One profile per person (user_id is unique): re-adding someone
      // reactivates their earlier profile (R1.11). An omitted specialization
      // keeps the stored one.
      const fields = {
        designation: write.designation,
        isActive: true,
        branchId: write.branchId,
        roleWitness: write.roleWitness,
        ...(write.specialization === undefined ? {} : { specialization: write.specialization }),
      }
      return db
        .insert(staffProfile)
        .values({ userId: write.userId, ...fields })
        .onConflictDoUpdate({
          target: staffProfile.userId,
          set: { ...fields, updatedAt: new Date() },
        })
    }
    case 'end_sessions':
      return db.delete(session).where(eq(session.userId, write.userId))
  }
}

/** The people and branches a write touches; all must be locked by the snapshot. */
function touched(write: BranchRoleWrite): { people: string[]; branches: string[] } {
  switch (write.kind) {
    case 'branch_owner':
      return {
        people: [write.to, ...(write.from === null ? [] : [write.from])],
        branches: [write.branchId],
      }
    case 'branch_manager':
      return {
        people: [write.to, write.from].filter((id): id is string => id !== null),
        branches: [write.branchId],
      }
    default:
      return { people: [write.userId], branches: [] }
  }
}

function assertCovered(snapshot: BranchRoleSnapshot, writes: readonly BranchRoleWrite[]): void {
  const people = new Set(snapshot.users.map((u) => u.id))
  const branches = new Set(snapshot.branches.map((b) => b.id))
  for (const write of writes) {
    const { people: p, branches: b } = touched(write)
    if (p.some((id) => !people.has(id)) || b.some((id) => !branches.has(id))) {
      throw new Error(`Role write ${write.kind} touches a row outside its snapshot.`)
    }
  }
}

// A stale plan or a concurrent change: the guard aborted, the database
// rejected the final state, or two transactions deadlocked. Postgres rolled
// the whole batch back in every case.
function isStaleRoleChange(error: unknown): boolean {
  return (
    isGuardAbort(error) ||
    isConstraintViolation(error, SQLSTATE.foreignKeyViolation, ROLE_KEYS) ||
    isConstraintViolation(error, SQLSTATE.uniqueViolation, [ONE_RECEPTIONIST_INDEX]) ||
    isConstraintViolation(error, SQLSTATE.checkViolation, ROLE_STATE_CHECKS) ||
    findDriverError(error, [SQLSTATE.deadlockDetected]) !== null
  )
}

/**
 * Apply a planned role change in one transaction, only if every row in
 * `snapshot` is still as it was read. `snapshot` must be the one the plan was
 * made from. Returns the people signed out, or `stale` when nothing was
 * written because something changed meanwhile; the caller re-reads and plans
 * again. An empty plan writes nothing, not even an audit entry.
 */
export async function applyBranchRolePlan(params: {
  snapshot: BranchRoleSnapshot
  writes: readonly BranchRoleWrite[]
  audit: BranchRoleAudit
}): Promise<ApplyBranchRolePlanResult> {
  const { snapshot, writes, audit } = params
  const signedOut = writes.flatMap((w) => (w.kind === 'end_sessions' ? [w.userId] : []))
  if (writes.length === 0) {
    return { ok: true, signedOut, reassignments: 0 }
  }
  assertCovered(snapshot, writes)

  // Everyone the change touches; whoever no longer works at a branch where
  // they are booked loses those bookings to reassignment (R1.7).
  const people = [...new Set(writes.flatMap((w) => touched(w).people))]
  const head: BatchItem<'pg'>[] = [
    db.execute(DEFER_ROLE_KEYS),
    db.execute(lockPeople(snapshot.users.map((u) => u.id))),
    db.execute(LOCK_BRANCHES),
    db.execute(unchangedGuard(snapshot)),
    ...writes.map(statementFor),
  ]
  const statements: BatchItem<'pg'>[] = [
    ...head,
    releaseAssignmentsOfPeopleStatement({ userIds: people, actorId: audit.actorId }),
    ...signedOut.map(realtimeRevocationStatement),
    db.insert(auditLog).values({
      actorId: audit.actorId,
      action: audit.action,
      entityType: audit.entityType,
      entityId: audit.entityId,
      branchId: audit.branchId,
      oldValues: audit.oldValues ?? null,
      newValues: audit.newValues ?? null,
      ipAddress: audit.ipAddress ?? null,
    }),
  ]

  let results: unknown[]
  try {
    results = await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]])
  } catch (error) {
    if (isStaleRoleChange(error)) {
      return { ok: false, reason: 'stale' }
    }
    throw error
  }
  const reassignments = releasedBookingIds(results[head.length]).length
  return { ok: true, signedOut, reassignments }
}

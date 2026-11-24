/************************************************************
 * Module Name  : branch/roles
 * Scope        : Business Logic — Branch roles (multi-branch R1.2–R1.7, R1.11)
 *
 * Description  : Plans a role change at one branch: who may make it, who it
 *                applies to, and every row it must write so the role
 *                relationships stay consistent. Pure: the caller loads a
 *                snapshot of the involved rows, this returns the writes, and
 *                the data layer applies them in one transaction with
 *                compare-and-set guards. The database constraints from
 *                migration 0004 are the final safety net.
 *
 * Responsibilities :
 * - planBranchRoleChange(snapshot, actor, request) → writes or a refusal
 * - applyRoleWrites(snapshot, writes)              → the snapshot afterwards
 * - roleInvariantViolations(snapshot)              → what is inconsistent
 *
 * Rules (user decisions, 26–28 October 2026):
 * - Owner: Developer only. A previous Owner left with no branch becomes a Customer.
 * - Manager and Receptionist: the branch's Owner or the Developer.
 * - Stylists and Therapists: the branch's Manager, its Owner or the Developer.
 * - One Manager and one Receptionist per branch; a Manager may cover several
 *   branches; Receptionists and Staff belong to one branch.
 * - Owners never hold a performing role; nobody changes their own role; the
 *   Developer's role is never changed here.
 * - A change never silently affects another Owner's branch.
 * - Anyone who loses their last role becomes a Customer and is signed out.
 *
 * Write order : profile deactivations, branch references, user roles, profile
 *               activations, then sign-outs. With the deferrable role keys
 *               deferred, only the one-Receptionist index cares about order,
 *               and deactivating first satisfies it.
 ************************************************************/

import type { BranchStatusValue, StaffDesignation } from '@rgss/types'
import { type BranchAccess, type BranchRole, findAccessibleBranch } from './access'

export type RoleSnapshotUser = { id: string; role: string | null }

export type RoleSnapshotProfile = {
  userId: string
  designation: StaffDesignation
  branchId: string | null
  roleWitness: string | null
  isActive: boolean
}

export type RoleSnapshotBranch = {
  id: string
  status: BranchStatusValue
  ownerUserId: string | null
  managerUserId: string | null
}

/**
 * The rows a role change reads. Must include every branch, the target, and
 * the branch's current Owner, Manager and Receptionist with their profiles.
 */
export type RoleSnapshot = {
  users: readonly RoleSnapshotUser[]
  profiles: readonly RoleSnapshotProfile[]
  branches: readonly RoleSnapshotBranch[]
}

export type ServiceDesignation = 'stylist' | 'therapist'

/**
 * Replacing a holder names the holder the actor saw (`expectedHolderId`, null
 * for none), so a concurrent replacement can't be overwritten unseen (R1.4).
 */
export type BranchRoleRequest =
  | { kind: 'set_owner'; branchId: string; userId: string; expectedHolderId: string | null }
  | { kind: 'set_manager'; branchId: string; userId: string; expectedHolderId: string | null }
  | {
      kind: 'set_receptionist'
      branchId: string
      userId: string
      expectedHolderId: string | null
    }
  | {
      kind: 'add_staff'
      branchId: string
      userId: string
      designation: ServiceDesignation
      specialization?: string | null | undefined
    }
  | { kind: 'remove'; branchId: string; userId: string }

export type PerformingRole = 'staff' | 'receptionist' | 'manager'

export type RoleWrite =
  | { kind: 'profile_deactivate'; userId: string }
  | { kind: 'branch_owner'; branchId: string; from: string | null; to: string }
  | { kind: 'branch_manager'; branchId: string; from: string | null; to: string | null }
  | { kind: 'user_role'; userId: string; from: string | null; to: string }
  | {
      kind: 'profile_activate'
      userId: string
      designation: StaffDesignation
      roleWitness: PerformingRole
      branchId: string | null
      specialization?: string | null | undefined
    }
  | { kind: 'end_sessions'; userId: string }

/**
 * - forbidden:   the actor may not make this change
 * - not_found:   no such branch (or not one the actor can see), or person
 * - unavailable: the person holds a role that rules this out
 * - invalid:     the change doesn't make sense here (shut-down branch, ...)
 * - stale:       the holder the actor saw is no longer the holder
 */
export type RoleRefusalCode = 'forbidden' | 'not_found' | 'unavailable' | 'invalid' | 'stale'

export type RoleRefusal = { ok: false; code: RoleRefusalCode; message: string }

export type RolePlan = {
  ok: true
  /** Empty when the request is already satisfied. */
  writes: RoleWrite[]
  /** People who lose their last role and are signed out. */
  signedOut: string[]
}

export type RoleActor = { id: string; access: BranchAccess }

const OWNER_LEVEL: readonly BranchRole[] = ['owner', 'developer']
const MANAGER_LEVEL: readonly BranchRole[] = ['manager', 'owner', 'developer']

function refuse(code: RoleRefusalCode, message: string): RoleRefusal {
  return { ok: false, code, message }
}

const STALE = refuse('stale', 'Someone changed this branch just now. Reload and try again.')

/** Collects writes by phase, so the final order is always safe. */
class WritePlan {
  private readonly deactivations: RoleWrite[] = []
  private readonly branchWrites: RoleWrite[] = []
  private readonly roleWrites: RoleWrite[] = []
  private readonly activations: RoleWrite[] = []
  private readonly signOuts = new Set<string>()

  add(write: RoleWrite): this {
    switch (write.kind) {
      case 'profile_deactivate':
        this.deactivations.push(write)
        break
      case 'branch_owner':
      case 'branch_manager':
        this.branchWrites.push(write)
        break
      case 'user_role':
        this.roleWrites.push(write)
        break
      case 'profile_activate':
        this.activations.push(write)
        break
      case 'end_sessions':
        this.signOuts.add(write.userId)
        break
    }
    return this
  }

  /** Strip every role from someone: they become a Customer and are signed out. */
  demote(user: RoleSnapshotUser, hasActiveProfile: boolean): this {
    if (hasActiveProfile) {
      this.add({ kind: 'profile_deactivate', userId: user.id })
    }
    this.add({ kind: 'user_role', userId: user.id, from: user.role, to: 'customer' })
    return this.add({ kind: 'end_sessions', userId: user.id })
  }

  done(): RolePlan {
    const signedOut = [...this.signOuts]
    return {
      ok: true,
      writes: [
        ...this.deactivations,
        ...this.branchWrites,
        ...this.roleWrites,
        ...this.activations,
        ...signedOut.map((userId): RoleWrite => ({ kind: 'end_sessions', userId })),
      ],
      signedOut,
    }
  }
}

function userOf(snapshot: RoleSnapshot, userId: string | null): RoleSnapshotUser | null {
  return userId === null ? null : (snapshot.users.find((u) => u.id === userId) ?? null)
}

function activeProfileOf(snapshot: RoleSnapshot, userId: string): RoleSnapshotProfile | null {
  return snapshot.profiles.find((p) => p.userId === userId && p.isActive) ?? null
}

function asRole(role: string | null): string {
  return role ?? 'customer'
}

/** True when the person holds no role and no active profile: free to take one. */
function isFreeCustomer(snapshot: RoleSnapshot, user: RoleSnapshotUser): boolean {
  return asRole(user.role) === 'customer' && activeProfileOf(snapshot, user.id) === null
}

/** Where a Receptionist or Staff member works, when their profile agrees with their role. */
function performingBranchOf(snapshot: RoleSnapshot, user: RoleSnapshotUser): string | null {
  const profile = activeProfileOf(snapshot, user.id)
  const role = asRole(user.role)
  return profile && (role === 'staff' || role === 'receptionist') && profile.roleWitness === role
    ? profile.branchId
    : null
}

function actorMay(actor: RoleActor, branchId: string, allowed: readonly BranchRole[]): boolean {
  const at = findAccessibleBranch(actor.access, branchId)
  return at !== null && allowed.includes(at.role)
}

/** Plan a role change at one branch, or say why it can't be made. */
export function planBranchRoleChange(
  snapshot: RoleSnapshot,
  actor: RoleActor,
  request: BranchRoleRequest,
): RolePlan | RoleRefusal {
  const branch = snapshot.branches.find((b) => b.id === request.branchId)
  if (!branch || findAccessibleBranch(actor.access, request.branchId) === null) {
    return refuse('not_found', 'Branch not found.')
  }
  if (request.userId === actor.id) {
    return refuse('forbidden', 'You cannot change your own role.')
  }
  const target = userOf(snapshot, request.userId)
  if (!target) {
    return refuse('not_found', 'Person not found.')
  }
  if (target.role === 'developer') {
    return refuse('forbidden', "The Developer account's role can only be changed in the database.")
  }
  if (request.kind !== 'remove' && branch.status === 'shutdown') {
    return refuse('invalid', 'This branch is shut down.')
  }

  switch (request.kind) {
    case 'set_owner':
      return request.expectedHolderId === branch.ownerUserId
        ? planOwner(snapshot, actor, branch, target)
        : STALE
    case 'set_manager':
      return request.expectedHolderId === branch.managerUserId
        ? planManager(snapshot, actor, branch, target)
        : STALE
    case 'set_receptionist':
      return request.expectedHolderId === (receptionistAt(snapshot, branch.id)?.userId ?? null)
        ? planReceptionist(snapshot, actor, branch, target)
        : STALE
    case 'add_staff':
      return planStaff(snapshot, actor, branch, target, request.designation, request.specialization)
    case 'remove':
      return planRemove(snapshot, actor, branch, target)
  }
}

function planOwner(
  snapshot: RoleSnapshot,
  actor: RoleActor,
  branch: RoleSnapshotBranch,
  target: RoleSnapshotUser,
): RolePlan | RoleRefusal {
  if (!actorMay(actor, branch.id, ['developer'])) {
    return refuse('forbidden', 'Only the Developer can change a branch Owner.')
  }
  if (branch.ownerUserId === target.id) {
    return new WritePlan().done()
  }
  const role = asRole(target.role)
  if (!(role === 'owner' || isFreeCustomer(snapshot, target))) {
    return refuse(
      'unavailable',
      'An Owner cannot hold another role. Remove their current role first.',
    )
  }

  const plan = new WritePlan().add({
    kind: 'branch_owner',
    branchId: branch.id,
    from: branch.ownerUserId,
    to: target.id,
  })
  if (role !== 'owner') {
    plan.add({ kind: 'user_role', userId: target.id, from: target.role, to: 'owner' })
  }

  const previous = userOf(snapshot, branch.ownerUserId)
  if (branch.ownerUserId !== null && !previous) {
    return STALE
  }
  if (previous) {
    const ownsAnother = snapshot.branches.some(
      (b) => b.id !== branch.id && b.ownerUserId === previous.id,
    )
    if (!ownsAnother) {
      plan.demote(previous, activeProfileOf(snapshot, previous.id) !== null)
    }
  }
  return plan.done()
}

/** Replace the branch's Manager reference and demote the old one if it was their last branch. */
function replaceManager(
  snapshot: RoleSnapshot,
  plan: WritePlan,
  branch: RoleSnapshotBranch,
  next: string | null,
): RoleRefusal | null {
  plan.add({ kind: 'branch_manager', branchId: branch.id, from: branch.managerUserId, to: next })
  if (branch.managerUserId === null || branch.managerUserId === next) {
    return null
  }
  const previous = userOf(snapshot, branch.managerUserId)
  if (!previous) {
    return STALE
  }
  const managesAnother = snapshot.branches.some(
    (b) => b.id !== branch.id && b.managerUserId === previous.id,
  )
  if (!managesAnother) {
    plan.demote(previous, activeProfileOf(snapshot, previous.id) !== null)
  }
  return null
}

function planManager(
  snapshot: RoleSnapshot,
  actor: RoleActor,
  branch: RoleSnapshotBranch,
  target: RoleSnapshotUser,
): RolePlan | RoleRefusal {
  if (!actorMay(actor, branch.id, OWNER_LEVEL)) {
    return refuse('forbidden', "Only the branch's Owner or the Developer can choose its Manager.")
  }
  if (branch.managerUserId === target.id) {
    return new WritePlan().done()
  }

  const role = asRole(target.role)
  const plan = new WritePlan()
  if (role === 'manager') {
    // Already a Manager elsewhere: they now cover this branch too.
  } else if (isFreeCustomer(snapshot, target)) {
    plan.add({ kind: 'user_role', userId: target.id, from: target.role, to: 'manager' })
  } else if (role === 'staff' || role === 'receptionist') {
    // Promotion moves them off their own branch, so the actor must also have
    // Owner-level access there.
    const from = performingBranchOf(snapshot, target)
    if (from === null || !actorMay(actor, from, OWNER_LEVEL)) {
      return refuse('unavailable', 'This person works at another branch.')
    }
    plan.add({ kind: 'user_role', userId: target.id, from: target.role, to: 'manager' })
  } else {
    return refuse('unavailable', 'An Owner cannot be a Manager.')
  }

  if (role !== 'manager' || activeProfileOf(snapshot, target.id)?.roleWitness !== 'manager') {
    plan.add({
      kind: 'profile_activate',
      userId: target.id,
      designation: 'manager',
      roleWitness: 'manager',
      branchId: null,
    })
  }
  return replaceManager(snapshot, plan, branch, target.id) ?? plan.done()
}

/** The active Receptionist's profile at a branch, if any. */
export function receptionistAt(
  snapshot: RoleSnapshot,
  branchId: string,
): RoleSnapshotProfile | null {
  return (
    snapshot.profiles.find(
      (p) => p.isActive && p.roleWitness === 'receptionist' && p.branchId === branchId,
    ) ?? null
  )
}

/**
 * Whose profiles someone with `role` at a branch may edit on the Staff page:
 * a Manager edits Stylists and Therapists only; the Owner and the Developer
 * edit everyone who works there (R1.5, R1.11).
 */
export function editableStaffRoles(role: BranchRole): readonly PerformingRole[] {
  if (role === 'owner' || role === 'developer') {
    return ['staff', 'receptionist', 'manager']
  }
  return role === 'manager' ? ['staff'] : []
}

/** A role someone holds at one branch. */
export type HeldBranchRole = 'owner' | 'manager' | 'receptionist' | 'staff'

/** The role this person holds at this branch, or null when none. */
export function heldRoleAt(
  snapshot: RoleSnapshot,
  branchId: string,
  userId: string,
): HeldBranchRole | null {
  const branch = snapshot.branches.find((b) => b.id === branchId)
  if (branch?.ownerUserId === userId) {
    return 'owner'
  }
  if (branch?.managerUserId === userId) {
    return 'manager'
  }
  const user = userOf(snapshot, userId)
  if (user && performingBranchOf(snapshot, user) === branchId) {
    const role = asRole(user.role)
    return role === 'receptionist' || role === 'staff' ? role : null
  }
  return null
}

function planReceptionist(
  snapshot: RoleSnapshot,
  actor: RoleActor,
  branch: RoleSnapshotBranch,
  target: RoleSnapshotUser,
): RolePlan | RoleRefusal {
  if (!actorMay(actor, branch.id, OWNER_LEVEL)) {
    return refuse(
      'forbidden',
      "Only the branch's Owner or the Developer can choose its Receptionist.",
    )
  }
  const role = asRole(target.role)
  const worksAt = performingBranchOf(snapshot, target)
  if (role === 'receptionist' && worksAt === branch.id) {
    return new WritePlan().done()
  }
  const free = isFreeCustomer(snapshot, target)
  if (!(free || (role === 'staff' && worksAt === branch.id))) {
    return refuse(
      'unavailable',
      role === 'staff' || role === 'receptionist'
        ? 'This person works at another branch.'
        : 'This person already has a role. Remove it first.',
    )
  }

  const plan = new WritePlan()
  const current = receptionistAt(snapshot, branch.id)
  if (current && current.userId !== target.id) {
    const previous = userOf(snapshot, current.userId)
    if (!previous) {
      return STALE
    }
    plan.demote(previous, true)
  }
  plan.add({ kind: 'user_role', userId: target.id, from: target.role, to: 'receptionist' })
  plan.add({
    kind: 'profile_activate',
    userId: target.id,
    designation: 'receptionist',
    roleWitness: 'receptionist',
    branchId: branch.id,
  })
  return plan.done()
}

function planStaff(
  snapshot: RoleSnapshot,
  actor: RoleActor,
  branch: RoleSnapshotBranch,
  target: RoleSnapshotUser,
  designation: ServiceDesignation,
  specialization: string | null | undefined,
): RolePlan | RoleRefusal {
  if (!actorMay(actor, branch.id, MANAGER_LEVEL)) {
    return refuse(
      'forbidden',
      "Only the branch's Manager, its Owner or the Developer can add staff.",
    )
  }
  if (!isFreeCustomer(snapshot, target)) {
    return refuse(
      'unavailable',
      performingBranchOf(snapshot, target) === branch.id
        ? 'This person is already on the staff here.'
        : 'This person already has a role. They must be removed from it first.',
    )
  }
  return new WritePlan()
    .add({ kind: 'user_role', userId: target.id, from: target.role, to: 'staff' })
    .add({
      kind: 'profile_activate',
      userId: target.id,
      designation,
      roleWitness: 'staff',
      branchId: branch.id,
      specialization,
    })
    .done()
}

function planRemove(
  snapshot: RoleSnapshot,
  actor: RoleActor,
  branch: RoleSnapshotBranch,
  target: RoleSnapshotUser,
): RolePlan | RoleRefusal {
  if (branch.ownerUserId === target.id) {
    return refuse('invalid', 'Change the Owner through the Owner handover instead.')
  }
  if (branch.managerUserId === target.id) {
    if (!actorMay(actor, branch.id, OWNER_LEVEL)) {
      return refuse('forbidden', "Only the branch's Owner or the Developer can remove its Manager.")
    }
    const plan = new WritePlan()
    return replaceManager(snapshot, plan, branch, null) ?? plan.done()
  }

  const role = asRole(target.role)
  if (performingBranchOf(snapshot, target) !== branch.id) {
    return refuse('not_found', 'This person does not work at this branch.')
  }
  if (!actorMay(actor, branch.id, role === 'receptionist' ? OWNER_LEVEL : MANAGER_LEVEL)) {
    return refuse('forbidden', 'You do not have permission to remove this person.')
  }
  return new WritePlan().demote(target, true).done()
}

/** The snapshot after applying `writes`. Used by tests and for previews. */
export function applyRoleWrites(
  snapshot: RoleSnapshot,
  writes: readonly RoleWrite[],
): RoleSnapshot {
  const users = new Map(snapshot.users.map((u) => [u.id, { ...u }]))
  const profiles = new Map(snapshot.profiles.map((p) => [p.userId, { ...p }]))
  const branches = new Map(snapshot.branches.map((b) => [b.id, { ...b }]))

  for (const write of writes) {
    switch (write.kind) {
      case 'profile_deactivate': {
        const profile = profiles.get(write.userId)
        if (profile) {
          profiles.set(write.userId, { ...profile, isActive: false, roleWitness: null })
        }
        break
      }
      case 'branch_owner':
      case 'branch_manager': {
        const row = branches.get(write.branchId)
        if (row) {
          branches.set(
            write.branchId,
            write.kind === 'branch_owner'
              ? { ...row, ownerUserId: write.to }
              : { ...row, managerUserId: write.to },
          )
        }
        break
      }
      case 'user_role': {
        const row = users.get(write.userId)
        if (row) {
          users.set(write.userId, { ...row, role: write.to })
        }
        break
      }
      case 'profile_activate':
        profiles.set(write.userId, {
          userId: write.userId,
          designation: write.designation,
          branchId: write.branchId,
          roleWitness: write.roleWitness,
          isActive: true,
        })
        break
      case 'end_sessions':
        break
    }
  }

  return {
    users: [...users.values()],
    profiles: [...profiles.values()],
    branches: [...branches.values()],
  }
}

/** Every broken role relationship in a snapshot; empty when consistent. */
export function roleInvariantViolations(snapshot: RoleSnapshot): string[] {
  const problems: string[] = []
  const roleOf = new Map(snapshot.users.map((u) => [u.id, asRole(u.role)]))
  const developers = snapshot.users.filter((u) => u.role === 'developer').length
  if (developers > 1) {
    problems.push('more than one Developer')
  }

  for (const b of snapshot.branches) {
    if (b.ownerUserId !== null && roleOf.get(b.ownerUserId) !== 'owner') {
      problems.push(`${b.id}: Owner ${b.ownerUserId} is not an owner`)
    }
    if (b.managerUserId !== null && roleOf.get(b.managerUserId) !== 'manager') {
      problems.push(`${b.id}: Manager ${b.managerUserId} is not a manager`)
    }
    if (b.ownerUserId !== null && b.ownerUserId === b.managerUserId) {
      problems.push(`${b.id}: Owner is also the Manager`)
    }
    const receptionists = snapshot.profiles.filter(
      (p) => p.isActive && p.roleWitness === 'receptionist' && p.branchId === b.id,
    )
    if (receptionists.length > 1) {
      problems.push(`${b.id}: more than one Receptionist`)
    }
  }

  for (const u of snapshot.users) {
    const role = asRole(u.role)
    const profile = activeProfileOf(snapshot, u.id)
    switch (role) {
      case 'owner':
        if (!snapshot.branches.some((b) => b.ownerUserId === u.id)) {
          problems.push(`${u.id}: Owner without a branch`)
        }
        if (profile) {
          problems.push(`${u.id}: Owner with a performing profile`)
        }
        break
      case 'manager':
        if (!snapshot.branches.some((b) => b.managerUserId === u.id)) {
          problems.push(`${u.id}: Manager without a branch`)
        }
        if (profile?.roleWitness !== 'manager' || profile.branchId !== null) {
          problems.push(`${u.id}: Manager profile does not match`)
        }
        break
      case 'receptionist':
      case 'staff':
        if (profile?.roleWitness !== role || profile.branchId === null) {
          problems.push(`${u.id}: ${role} profile does not match`)
        }
        break
      default:
        if (profile) {
          problems.push(`${u.id}: ${role} with an active profile`)
        }
    }
  }
  return problems
}

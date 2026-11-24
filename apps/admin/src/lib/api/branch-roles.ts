/************************************************************
 * Module Name  : branch-roles (admin)
 * Scope        : API Infrastructure — people administration (R1.4, R1.5, R1.11)
 *
 * Description  : The one path every role change takes, for Users & Roles and
 *                the Staff page alike:
 *                1. read the snapshot (getRoleSnapshot) for the actor, the
 *                   person and the branch;
 *                2. work out the actor's access from those same rows, so the
 *                   apply step re-checks the actor's authority too;
 *                3. plan with @rgss/business planBranchRoleChange;
 *                4. apply in one transaction that re-checks the snapshot,
 *                   writes the audit entry, signs people out and records
 *                   their realtime token revocations;
 *                5. revoke those tokens at Ably now (R2.6) and queue the
 *                   follow-up, so live updates stop with the change.
 *
 * Responsibilities :
 * - changeBranchRole(actorId, request) → the applied plan, or an AppError
 * - previewBranchRoles(snapshot, actorId, userId, requests) → what's possible
 * - accessIn(snapshot, userId) / refusalError(refusal)
 *
 * Notes        : The caller has already run requireBranchRole, which checks
 *                the active branch and the branch the form was rendered for.
 ************************************************************/

import {
  type BranchAccess,
  type BranchRoleRequest,
  planBranchRoleChange,
  type RolePlan,
  type RoleRefusal,
  type RoleRefusalCode,
  resolveBranchAccess,
} from '@rgss/business'
import { applyBranchRolePlan, type BranchRoleSnapshot, getRoleSnapshot } from '@rgss/db/queries'
import { AppError, badRequest, conflict, ERROR_CODES, forbidden, notFound } from '@rgss/errors'
import { type LiveUpdatesStatus, revokeLiveUpdates } from '@/lib/realtime/revocation'

const STALE_MESSAGE = 'Someone changed this branch just now. Reload and try again.'

/** The person's branch access, decided from the snapshot's own rows. */
export function accessIn(snapshot: BranchRoleSnapshot, userId: string): BranchAccess | null {
  const user = snapshot.users.find((u) => u.id === userId)
  if (!user) {
    return null
  }
  return resolveBranchAccess({
    user,
    branches: snapshot.branches,
    profile: snapshot.profiles.find((p) => p.userId === userId) ?? null,
  })
}

/** The HTTP error for a refused role change. */
export function refusalError(refusal: RoleRefusal): AppError {
  switch (refusal.code) {
    case 'forbidden':
      return forbidden(refusal.message)
    case 'not_found':
      return notFound(refusal.message)
    case 'unavailable':
    case 'stale':
      return conflict(ERROR_CODES.CONFLICT, refusal.message)
    case 'invalid':
      return badRequest(refusal.message)
  }
}

function signedOut(): AppError {
  return new AppError({
    code: ERROR_CODES.UNAUTHENTICATED,
    message: 'You must be signed in.',
    statusCode: 401,
  })
}

/** The rows the audit entry keeps as "before". */
function before(snapshot: BranchRoleSnapshot, userId: string) {
  const profile = snapshot.profiles.find((p) => p.userId === userId) ?? null
  return {
    role: snapshot.users.find((u) => u.id === userId)?.role ?? null,
    profile: profile && {
      designation: profile.designation,
      branchId: profile.branchId,
      roleWitness: profile.roleWitness,
      isActive: profile.isActive,
    },
  }
}

export type BranchRoleChangeResult = {
  plan: RolePlan
  snapshot: BranchRoleSnapshot
  /** False when the request was already satisfied: nothing was written. */
  changed: boolean
  signedOut: string[]
  /** Whether the signed-out people's live updates were cut off (R2.6). */
  liveUpdates: LiveUpdatesStatus
  /** Confirmed bookings still to come that lost their assignee (R1.7). */
  reassignments: number
}

/**
 * Plan and apply `request` for `actorId`. Throws an AppError when the change
 * is refused (403/404/409/400) or when something changed meanwhile (409).
 */
export async function changeBranchRole(
  actorId: string,
  request: BranchRoleRequest,
): Promise<BranchRoleChangeResult> {
  const snapshot = await getRoleSnapshot(request.branchId, [actorId, request.userId])
  const access = accessIn(snapshot, actorId)
  if (!access) {
    throw signedOut()
  }

  const plan = planBranchRoleChange(snapshot, { id: actorId, access }, request)
  if (!plan.ok) {
    throw refusalError(plan)
  }
  if (plan.writes.length === 0) {
    return { plan, snapshot, changed: false, signedOut: [], liveUpdates: 'none', reassignments: 0 }
  }

  const result = await applyBranchRolePlan({
    snapshot,
    writes: plan.writes,
    audit: {
      actorId,
      action: 'status_change',
      entityType: 'user',
      entityId: request.userId,
      branchId: request.branchId,
      oldValues: before(snapshot, request.userId),
      newValues: { change: request, writes: plan.writes },
    },
  })
  if (!result.ok) {
    throw conflict(ERROR_CODES.CONFLICT, STALE_MESSAGE)
  }
  const liveUpdates = await revokeLiveUpdates(result.signedOut)
  return {
    plan,
    snapshot,
    changed: true,
    signedOut: result.signedOut,
    liveUpdates,
    reassignments: result.reassignments,
  }
}

/**
 * What one request would do, without writing anything: `change` writes
 * something, `done` is already true, anything else is the refusal's code.
 */
export type RolePreview = {
  kind: BranchRoleRequest['kind']
  outcome: 'change' | 'done' | RoleRefusalCode
  reason: string | null
}

/**
 * Dry-run `requests` against an already-read snapshot. Used to show the
 * actions a search match supports; POST plans again from fresh rows.
 */
export function previewBranchRoles(
  snapshot: BranchRoleSnapshot,
  actorId: string,
  requests: readonly BranchRoleRequest[],
): RolePreview[] {
  const access = accessIn(snapshot, actorId)
  return requests.map((request): RolePreview => {
    if (!access) {
      return { kind: request.kind, outcome: 'forbidden', reason: 'You must be signed in.' }
    }
    const plan = planBranchRoleChange(snapshot, { id: actorId, access }, request)
    if (!plan.ok) {
      return { kind: request.kind, outcome: plan.code, reason: plan.message }
    }
    return { kind: request.kind, outcome: plan.writes.length > 0 ? 'change' : 'done', reason: null }
  })
}

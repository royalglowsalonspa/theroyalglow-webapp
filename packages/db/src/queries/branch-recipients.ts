/************************************************************
 * Module Name  : branch-recipients
 * Scope        : Data Access — who hears about a branch (multi-branch R1.9, R7.4)
 *
 * Description  : The people who hold each branch's roles now, with the
 *                contact details background jobs need: the Owner, the
 *                Manager and the Receptionist, plus the Developer. Jobs pass
 *                these to the pure recipient rules in @rgss/business
 *                (branch/recipients.ts).
 *
 * Notes        : One db.batch() read. The role-qualified Owner and Manager
 *                references can only name someone who holds that role. The
 *                Receptionist is the active staff profile whose role witness
 *                says so (a unique index allows one per branch). A deactivated
 *                profile has no witness, so it never appears.
 ************************************************************/

import type { BranchStatusValue } from '@rgss/types'
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../index'
import { user } from '../schema/auth'
import { branch } from '../schema/branch'
import { staffProfile } from '../schema/profile'

/** Someone who holds a branch role, with how to reach them. */
export type BranchContactRow = { userId: string; name: string; email: string }

/** A branch and its role holders now. */
export type BranchPeopleRow = {
  id: string
  name: string
  code: string
  status: BranchStatusValue
  isPrimary: boolean
  phone: string
  googleMapsUrl: string | null
  owner: BranchContactRow | null
  manager: BranchContactRow | null
  receptionist: BranchContactRow | null
}

export type BranchPeopleResult = {
  /** In display order, then by name. */
  branches: BranchPeopleRow[]
  developer: BranchContactRow | null
}

const ownerUser = alias(user, 'owner_user')
const managerUser = alias(user, 'manager_user')

function contact(
  userId: string | null,
  name: string | null,
  email: string | null,
): BranchContactRow | null {
  return userId !== null && name !== null && email !== null ? { userId, name, email } : null
}

/**
 * Every branch's role holders, or only those of `branchIds`. An empty list
 * reads nothing.
 */
export async function getBranchPeople(branchIds?: readonly string[]): Promise<BranchPeopleResult> {
  if (branchIds !== undefined && branchIds.length === 0) {
    return { branches: [], developer: null }
  }
  const ids = branchIds === undefined ? null : [...new Set(branchIds)]

  const [branchRows, receptionistRows, developerRows] = await db.batch([
    db
      .select({
        id: branch.id,
        name: branch.name,
        code: branch.code,
        status: branch.status,
        isPrimary: branch.isPrimary,
        phone: branch.phone,
        googleMapsUrl: branch.googleMapsUrl,
        ownerId: ownerUser.id,
        ownerName: ownerUser.name,
        ownerEmail: ownerUser.email,
        managerId: managerUser.id,
        managerName: managerUser.name,
        managerEmail: managerUser.email,
      })
      .from(branch)
      .leftJoin(ownerUser, eq(ownerUser.id, branch.ownerUserId))
      .leftJoin(managerUser, eq(managerUser.id, branch.managerUserId))
      .where(ids === null ? undefined : inArray(branch.id, ids))
      .orderBy(asc(branch.displayOrder), asc(branch.name), asc(branch.id)),
    db
      .select({
        branchId: staffProfile.branchId,
        userId: user.id,
        name: user.name,
        email: user.email,
      })
      .from(staffProfile)
      .innerJoin(user, eq(user.id, staffProfile.userId))
      .where(
        and(
          eq(staffProfile.roleWitness, 'receptionist'),
          eq(staffProfile.isActive, true),
          ids === null ? isNotNull(staffProfile.branchId) : inArray(staffProfile.branchId, ids),
        ),
      ),
    db
      .select({ userId: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.role, 'developer'))
      .limit(1),
  ])

  const receptionistByBranch = new Map<string, BranchContactRow>()
  for (const row of receptionistRows) {
    if (row.branchId !== null) {
      receptionistByBranch.set(row.branchId, {
        userId: row.userId,
        name: row.name,
        email: row.email,
      })
    }
  }

  return {
    branches: branchRows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      status: row.status,
      isPrimary: row.isPrimary,
      phone: row.phone,
      googleMapsUrl: row.googleMapsUrl,
      owner: contact(row.ownerId, row.ownerName, row.ownerEmail),
      manager: contact(row.managerId, row.managerName, row.managerEmail),
      receptionist: receptionistByBranch.get(row.id) ?? null,
    })),
    developer: developerRows[0] ?? null,
  }
}
